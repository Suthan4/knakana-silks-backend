import { S3UploadService } from "@/config/s3-upload.js";
import { Request, Response } from "express";

export class CommonController {
  private s3Service: S3UploadService;

  constructor() {
    this.s3Service = new S3UploadService();
  }

  /**
   * Upload single file
   * POST /api/upload
   * Body: multipart/form-data with 'file' field
   * Optional: folder=avatars
   */
  uploadFile = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const folder = req.body.folder || undefined;
      const result = await this.s3Service.uploadFile(req.file, folder);

      return res.json({
        success: true,
        url: result.url,
        key: result.key,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      return res.status(500).json({ error: error.message });
    }
  };

  /**
   * Upload multiple files
   * POST /api/upload/multiple
   * Body: multipart/form-data with 'files' field (multiple)
   * Optional: folder=products
   */
  uploadFiles = async (req: Request, res: Response) => {
    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const folder = req.body.folder || undefined;
      const files = req.files as Express.Multer.File[];
      const results = await this.s3Service.uploadFiles(files, folder);

      return res.json({
        success: true,
        files: results,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      return res.status(500).json({ error: error.message });
    }
  };

  /**
   * Delete file
   * DELETE /api/upload
   * Body: { url: "https://bucket.s3.region.amazonaws.com/key" }
   * OR { key: "folder/file.webp" }
   */
  deleteFile = async (req: Request, res: Response) => {
    try {
      const { url, key } = req.body;

      if (!url && !key) {
        return res.status(400).json({ error: "URL or key is required" });
      }

      const fileKey = key || this.s3Service.extractKeyFromUrl(url);
      await this.s3Service.deleteFile(fileKey);

      return res.json({
        success: true,
        message: "File deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete error:", error);
      return res.status(500).json({ error: error.message });
    }
  };

  /**
   * Delete multiple files
   * DELETE /api/upload/multiple
   * Body: { urls: ["url1", "url2"] } OR { keys: ["key1", "key2"] }
   */
  deleteFiles = async (req: Request, res: Response) => {
    try {
      const { urls, keys } = req.body;

      if (!urls && !keys) {
        return res.status(400).json({ error: "URLs or keys are required" });
      }

      const fileKeys =
        keys ||
        urls.map((url: string) => this.s3Service.extractKeyFromUrl(url));
      await this.s3Service.deleteFiles(fileKeys);

      return res.json({
        success: true,
        message: "Files deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete error:", error);
      return res.status(500).json({ error: error.message });
    }
  };
}
