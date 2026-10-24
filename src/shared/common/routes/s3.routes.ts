import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { CommonController } from "../controller/s3.controller.js";
import { ImageOptimizationError } from "../services/image-optimizer.service.js";

const router = express.Router();
const commonController = new CommonController();
const jsonParser = express.json();

// ── Accepted MIME types ──────────────────────────────────────────────────────
// Images: all common raster formats (optimiser will convert everything to WebP)
// Videos: passthrough, no optimisation
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/avif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/webm",
]);

// ── Multer configuration ─────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // 60 MB raw payload limit (images are expected ≤ ~20–30 MB originals;
    // 60 MB leaves plenty of headroom for large banner TIFFs or HEICs)
    fileSize: 60 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // Validate against the declared MIME type — NOT the filename extension.
    // Extension-based checks are trivially bypassed; MIME is checked again
    // via magic bytes inside the optimiser pipeline for images.
    if (
      ALLOWED_IMAGE_MIMES.has(file.mimetype) ||
      ALLOWED_VIDEO_MIMES.has(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type "${file.mimetype}". ` +
            `Accepted image types: jpeg, png, webp, gif, tiff, avif, heic. ` +
            `Accepted video types: mp4, mov, avi, mkv, webm.`
        )
      );
    }
  },
});

/**
 * Higher-order middleware wrapping Multer to trap payload size limits
 * and MIME rejection errors cleanly into 422/400 JSON responses.
 */
const handleUpload = (uploadMiddleware: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (err: any) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(422).json({
            success: false,
            code: "SIZE_POLICY_VIOLATION",
            error: "Raw file payload exceeds the maximum allowable limit of 60 MB.",
            details: { limitBytes: 60 * 1024 * 1024 },
          });
        }
        return res.status(400).json({
          success: false,
          code: "INVALID_FILE_TYPE",
          error: `Multer upload error: ${err.message}`,
        });
      }

      if (err instanceof ImageOptimizationError) {
        return res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
      }

      return res.status(422).json({
        success: false,
        code: "INVALID_FILE_TYPE",
        error: err.message || "Invalid file format or unsupported MIME type.",
      });
    });
  };
};

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * Upload single file
 * POST /api/upload
 * Body: multipart/form-data  — field: "file"
 * Optional body field: folder (e.g. "products", "banners", "categories")
 */
router.post(
  "/upload",
  handleUpload(upload.single("file")),
  commonController.uploadFile
);

/**
 * Upload multiple files (up to 10 per request)
 * POST /api/upload/multiple
 * Body: multipart/form-data  — field: "files" (repeatable)
 * Optional body field: folder
 */
router.post(
  "/upload/multiple",
  handleUpload(upload.array("files", 10)),
  commonController.uploadFiles
);

/**
 * Delete single file
 * DELETE /api/upload
 * Body: { url: "https://…/key" } OR { key: "folder/file.webp" }
 */
router.delete("/upload", jsonParser, commonController.deleteFile);

/**
 * Delete multiple files
 * DELETE /api/upload/multiple
 * Body: { urls: ["url1", "url2"] } OR { keys: ["key1", "key2"] }
 */
router.delete("/upload/multiple", jsonParser, commonController.deleteFiles);

export default router;
