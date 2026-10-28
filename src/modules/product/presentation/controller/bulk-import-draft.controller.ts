import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";
import { BulkImportDraftService } from "../../application/bulk/bulk-import-draft.service.js";
import { BulkImportJobService } from "../../application/bulk/bulk-import-job.service.js";
import { DriveService } from "@/modules/media/infrastructure/drive.service.js";
import {
  CreateBulkImportDraftSchema,
  UpdateBulkImportDraftSchema,
  MatchDriveSchema,
} from "../../application/bulk/dto/bulk-import-draft.dto.js";
import { AppError } from "@/shared/utils/errors.js";

@injectable()
export class BulkImportDraftController {
  constructor(
    @inject(BulkImportDraftService)
    private service: BulkImportDraftService,
    @inject(BulkImportJobService)
    private jobService: BulkImportJobService,
    @inject(DriveService)
    private driveService: DriveService
  ) {}

  // ── POST /api/products/bulk/draft ─────────────────────────────────────────

  async createDraft(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const dto = CreateBulkImportDraftSchema.parse(req.body);
      const userId = BigInt(req.user.userId);
      const draft = await this.service.createDraft(userId, dto);
      res.status(201).json({ success: true, data: draft });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── GET /api/products/bulk/draft ──────────────────────────────────────────

  async listDrafts(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const userId = BigInt(req.user.userId);
      const drafts = await this.service.listDrafts(userId);
      res.status(200).json({ success: true, data: drafts });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── GET /api/products/bulk/draft/:id ──────────────────────────────────────

  async getDraft(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const id = String(req.params.id);
      const userId = BigInt(req.user.userId);
      const draft = await this.service.getDraft(id, userId);
      res.status(200).json({ success: true, data: draft });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── PATCH /api/products/bulk/draft/:id ────────────────────────────────────

  async updateDraft(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const id = String(req.params.id);
      const dto = UpdateBulkImportDraftSchema.parse(req.body);
      const userId = BigInt(req.user.userId);
      const draft = await this.service.updateDraft(id, userId, dto);
      res.status(200).json({ success: true, data: draft });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── DELETE /api/products/bulk/draft/:id ───────────────────────────────────

  async deleteDraft(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const id = String(req.params.id);
      const userId = BigInt(req.user.userId);
      await this.service.deleteDraft(id, userId);
      res.status(204).send();
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── POST /api/products/bulk/draft/:id/parse ───────────────────────────────

  async parseDraft(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const id = String(req.params.id);
      const userId = BigInt(req.user.userId);

      if (req.file) {
        const draft = await this.service.parseAndValidate(id, userId, req.file.buffer);
        res.status(200).json({ success: true, data: draft });
        return;
      }

      const rawText = req.body?.rawText || req.body?.rawInput;
      if (rawText !== undefined) {
        const draft = await this.service.parseRawInput(id, userId, rawText);
        res.status(200).json({ success: true, data: draft });
        return;
      }

      // Default: parse existing draft's rawInput
      const draft = await this.service.parseRawInput(id, userId);
      res.status(200).json({ success: true, data: draft });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── POST /api/products/bulk/draft/:id/parse-drive ──────────────────────────

  async parseDriveFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Unauthorized: Missing authentication" });
        return;
      }
      const id = String(req.params.id);
      const userId = BigInt(req.user.userId);
      const { driveFileId } = req.body;

      if (!driveFileId || typeof driveFileId !== "string" || !driveFileId.trim()) {
        res.status(400).json({ success: false, message: "driveFileId is required" });
        return;
      }

      // Fetch file text from Google Drive (enforces 10MB limit and auth validation)
      const rawText = await this.driveService.readFileAsText(req.user.userId, driveFileId.trim());

      // Parse and validate using the same pipeline as local file upload
      const draft = await this.service.parseRawInput(id, userId, rawText);
      res.status(200).json({ success: true, data: draft });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── POST /api/products/bulk/draft/:id/match-drive ─────────────────────────

  async matchDrive(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const dto = MatchDriveSchema.parse(req.body);
      const userId = BigInt(req.user!.userId);
      const draft = await this.service.matchDrive(id, userId, dto);
      res.status(200).json({ success: true, data: draft });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── POST /api/products/bulk/draft/:id/import ──────────────────────────────

  async startDraftImport(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const userId = BigInt(req.user!.userId);
      const job = await this.service.startImportJob(id, userId);
      res.status(202).json({
        success: true,
        message: "Background image preparation and product import job started",
        data: { ...job, jobId: job.id, draftId: job.draftId, startedAt: job.createdAt },
      });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── POST /api/products/bulk/import-job ─────────────────────────────────────

  async startImportJob(req: Request, res: Response): Promise<void> {
    try {
      const { products, draftId } = req.body;
      const userId = req.user!.userId;
      const job = await this.jobService.startJob({
        userId,
        draftId,
        products,
      });
      res.status(202).json({
        success: true,
        message: "Bulk import job started",
        data: { ...job, jobId: job.id, draftId: job.draftId, startedAt: job.createdAt },
      });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── GET /api/products/bulk/job/:jobId ─────────────────────────────────────

  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const jobId = String(req.params.jobId);
      const userId = req.user!.userId;
      const job = await this.jobService.getJob(jobId, userId);
      res.status(200).json({
        success: true,
        data: { ...job, jobId: job.id, draftId: job.draftId, startedAt: job.createdAt },
      });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  async retryJob(req: Request, res: Response): Promise<void> {
    try {
      const jobId = String(req.params.jobId);
      const userId = req.user!.userId;
      const newJob = await this.jobService.retryJob(jobId, userId);
      res.status(202).json({
        success: true,
        message: "Retry import job started",
        data: { ...newJob, jobId: newJob.id, draftId: newJob.draftId, startedAt: newJob.createdAt },
      });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── POST /api/products/bulk/job/:jobId/cancel ──────────────────────────────

  async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const jobId = String(req.params.jobId);
      const userId = req.user!.userId;
      const job = await this.jobService.cancelJob(jobId, userId);
      res.status(200).json({
        success: true,
        message: job.status === "cancelled" ? "Job is already finished." : "Cancellation requested. The current safe operation will finish before the job stops.",
        data: { ...job, jobId: job.id, draftId: job.draftId, startedAt: job.createdAt },
      });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── GET /api/products/bulk/drive/folders ──────────────────────────────────

  async listDriveFolders(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const folders = await this.driveService.listFolders(userId);
      res.status(200).json({ success: true, data: folders });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── GET /api/products/bulk/drive/json-files ───────────────────────────────

  async listDriveJsonFiles(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const files = await this.driveService.listJsonFiles(userId);
      res.status(200).json({ success: true, data: files });
    } catch (err: any) {
      handleError(err, res);
    }
  }

  // ── GET /api/products/bulk/drive-proxy/:fileId ────────────────────────────

  async driveProxy(req: Request, res: Response): Promise<void> {
    try {
      const fileId = String(req.params.fileId);
      const userId = req.user!.userId;
      await this.driveService.streamFile(userId, fileId, res);
    } catch (err: any) {
      console.error("❌ Drive proxy streaming error:", err.message);
      res.status(502).json({ success: false, message: "Failed to stream file from Google Drive" });
    }
  }

  // ── GET /api/products/bulk/drive-thumbnail/:fileId ────────────────────────

  async driveThumbnail(req: Request, res: Response): Promise<void> {
    try {
      const fileId = String(req.params.fileId);
      const userId = req.user!.userId;
      const thumbnail = await this.driveService.getImageThumbnail(userId, fileId);
      res.setHeader("Content-Type", thumbnail.mimeType);
      res.setHeader("Content-Length", thumbnail.buffer.length);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).send(thumbnail.buffer);
    } catch (err: any) {
      const status = Number(err?.statusCode) || 502;
      // Do not fall back to the original 40+ MB image in the thumbnail route.
      res.status(status).json({
        success: false,
        message: err?.message || "Failed to load Google Drive thumbnail",
      });
    }
  }
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function handleError(err: any, res: Response): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }
  if (err?.name === "ZodError" || err?.issues) {
    const issues = err.issues || err.errors || [];
    const formatted = issues
      .map((i: any) => `${i.path?.join(".") || "field"}: ${i.message}`)
      .join(", ");
    res.status(400).json({
      success: false,
      message: formatted ? `Validation failed: ${formatted}` : "Validation failed",
      errors: issues,
    });
    return;
  }
  if (err?.code === "P2025") {
    res.status(404).json({ success: false, message: "Draft record not found" });
    return;
  }
  console.error("❌ BulkImportDraftController error:", err);
  res.status(500).json({ success: false, message: err.message || "Internal server error" });
}
