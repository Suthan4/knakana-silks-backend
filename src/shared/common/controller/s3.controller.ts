import { S3UploadService } from "@/config/s3-upload.js";
import { ImageOptimizationError } from "@/shared/common/services/image-optimizer.service.js";
import { Request, Response } from "express";

export class CommonController {
  private s3Service: S3UploadService;

  constructor() {
    this.s3Service = new S3UploadService();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Centralised error responder.
   * - ImageOptimizationError  → uses the error's own statusCode (422) and code.
   * - All other errors        → generic 500.
   */
  private handleError(res: Response, error: unknown, context: string): Response {
    if (error instanceof ImageOptimizationError) {
      console.error(`[${context}] Optimisation error (${error.code}):`, error.message);
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error(`[${context}] Unexpected error:`, error);
    return res.status(500).json({ success: false, error: msg });
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /**
   * Upload single file
   * POST /api/upload
   * Body: multipart/form-data — field: "file"
   * Optional body field: folder  (e.g. "products", "banners", "categories")
   */
  uploadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "No file provided" });
        return;
      }

      const folder: string | undefined = req.body.folder || undefined;
      const uploadType = req.body.uploadType;
      const result = await this.s3Service.uploadFile(req.file, folder, uploadType);

      res.json({
        success: true,
        url: result.url,
        key: result.key,
        ...(result.size !== undefined ? { size: result.size } : {}),
        ...(result.width !== undefined ? { width: result.width } : {}),
        ...(result.height !== undefined ? { height: result.height } : {}),
        ...(result.format !== undefined ? { format: result.format } : {}),
        ...(result.qualityUsed !== undefined ? { qualityUsed: result.qualityUsed } : {}),
        ...(result.attempts !== undefined ? { attempts: result.attempts } : {}),
      });
    } catch (error) {
      this.handleError(res, error, "uploadFile");
    }
  };

  /**
   * Upload multiple files
   * POST /api/upload/multiple
   * Body: multipart/form-data — field: "files" (repeatable, up to 10)
   * Optional body field: folder
   */
  uploadFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        res.status(400).json({ success: false, error: "No files provided" });
        return;
      }

      const folder: string | undefined = req.body.folder || undefined;
      const files = req.files as Express.Multer.File[];
      const results = await Promise.all(files.map((file) => this.s3Service.uploadFile(file, folder, req.body.uploadType)));

      res.json({
        success: true,
        count: results.length,
        files: results,
      });
    } catch (error) {
      this.handleError(res, error, "uploadFiles");
    }
  };

  /** Issue a short-lived URL for a private staging upload. */
  createStagedUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }
      const { fileName, fileType, fileSize, folder, uploadType } = req.body ?? {};
      if (typeof fileName !== "string" || typeof fileType !== "string" || !Number.isSafeInteger(fileSize)) {
        res.status(400).json({ success: false, message: "fileName, fileType, and integer fileSize are required." });
        return;
      }
      if (uploadType !== undefined && !["product", "category", "banner", "bulk"].includes(uploadType)) {
        res.status(400).json({ success: false, message: "Unsupported uploadType." });
        return;
      }
      const result = await this.s3Service.createStagedUpload({
        userId: req.user.userId,
        fileName,
        fileType,
        fileSize,
        folder: typeof folder === "string" ? folder : undefined,
        uploadType,
      });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, "createStagedUpload");
    }
  };

  /** Validate and process the staged upload through the normal image pipeline. */
  finalizeStagedUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }
      const { stagingKey, folder, uploadType } = req.body ?? {};
      if (typeof stagingKey !== "string" || !stagingKey) {
        res.status(400).json({ success: false, message: "stagingKey is required." });
        return;
      }
      if (uploadType !== undefined && !["product", "category", "banner", "bulk"].includes(uploadType)) {
        res.status(400).json({ success: false, message: "Unsupported uploadType." });
        return;
      }
      const result = await this.s3Service.finalizeStagedUpload({
        userId: req.user.userId,
        stagingKey,
        folder: typeof folder === "string" ? folder : undefined,
        uploadType,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      this.handleError(res, error, "finalizeStagedUpload");
    }
  };

  /**
   * Delete a single file
   * DELETE /api/upload
   * Body: { url: "https://…/key" } OR { key: "folder/file.webp" }
   */
  deleteFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, key } = req.body;

      if (!url && !key) {
        res.status(400).json({ success: false, error: "url or key is required" });
        return;
      }

      const fileKey: string = key || this.s3Service.extractKeyFromUrl(url);
      await this.s3Service.deleteFile(fileKey);

      res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
      this.handleError(res, error, "deleteFile");
    }
  };

  /**
   * Delete multiple files
   * DELETE /api/upload/multiple
   * Body: { urls: ["url1", "url2"] } OR { keys: ["key1", "key2"] }
   */
  deleteFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { urls, keys } = req.body;

      if (!urls && !keys) {
        res.status(400).json({ success: false, error: "urls or keys are required" });
        return;
      }

      const fileKeys: string[] =
        keys || urls.map((url: string) => this.s3Service.extractKeyFromUrl(url));
      await this.s3Service.deleteFiles(fileKeys);

      res.json({ success: true, message: "Files deleted successfully" });
    } catch (error) {
      this.handleError(res, error, "deleteFiles");
    }
  };
}
