import { randomUUID } from "node:crypto";
import path from "node:path";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

import { fileTypeFromBuffer } from "file-type";
import { getPrismaClient } from "@/lib/database/prisma.js";
import {
  KankanaImageOptimizer,
  ImageOptimizationError,
  type AssetCategory,
} from "../shared/common/services/image-optimizer.service.js";

export interface S3UploadResult {
  url: string;
  key: string;
  size?: number;
  width?: number;
  height?: number;
  format?: string;
  qualityUsed?: number;
  attempts?: number;
}

export interface S3UploadFileResult {
  originalname: string;
  success: boolean;
  result?: S3UploadResult;
  error?: string;
}

export class S3UploadService {
  private s3Client: S3Client;
  private bucket: string;
  private stagingBucket: string;
  private readonly prisma = getPrismaClient();

  constructor() {
    const isProd =
      process.env.NODE_ENV === "production" || process.env.NODE_ENV === "qa";

    this.s3Client = new S3Client(
      isProd
        ? {
            // Production: Real AWS S3 Configuration
            region: process.env.AWS_REGION!,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
          }
        : {
            // Development / LocalStack Fallback
            region: process.env.AWS_REGION || "us-east-1",
            endpoint: process.env.AWS_S3_ENDPOINT || "http://localhost:4566",
            forcePathStyle: true,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
            },
          }
    );
    this.bucket = process.env.AWS_S3_BUCKET!;
    // Production staging must use a separate private bucket; never place temporary
    // uploads in the public product-media bucket.
    this.stagingBucket = process.env.AWS_S3_STAGING_BUCKET || (isProd ? "" : this.bucket);
    if (!isProd) {
      this.ensureBucketExists();
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucket })
        );
        console.log(`🪣 Created missing local S3 bucket: ${this.bucket}`);
      } catch (err) {
        console.error("Failed to auto-create local S3 bucket:", err);
      }
    }
  }

  /**
   * Create a short-lived presigned PUT URL for a private staging object.
   * The object is not exposed as a product URL until finalizeStagedUpload
   * validates and processes it through the normal optimizer policy.
   */
  async createStagedUpload(input: {
    userId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    folder?: string;
    uploadType?: AssetCategory;
  }): Promise<{ uploadUrl: string; stagingKey: string; expiresIn: number }> {
    if (!this.stagingBucket) {
      throw new ImageOptimizationError("SECURITY_VALIDATION_FAILED", "Configure AWS_S3_STAGING_BUCKET as a separate private bucket before enabling direct uploads.", 503);
    }
    const maxBytes = 100 * 1024 * 1024;
    const allowedImageTypes = new Set([
      "image/jpeg", "image/png", "image/webp", "image/tiff", "image/avif",
    ]);
    if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > maxBytes) {
      throw new ImageOptimizationError("SIZE_POLICY_VIOLATION", "Image must be between 1 byte and 100 MB.", 413, { limitBytes: maxBytes });
    }
    if (!allowedImageTypes.has(input.fileType)) {
      throw new ImageOptimizationError("INVALID_FILE_TYPE", "Unsupported image format for direct upload.", 422);
    }

    const safeName = path.basename(input.fileName || "image").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "image";
    const allowedFolders = new Set(["products", "products/variants", "categories", "banners", "home-sections", "bulk"]);
    if (input.folder && !allowedFolders.has(input.folder)) {
      throw new ImageOptimizationError("SECURITY_VALIDATION_FAILED", "Unsupported upload folder.", 400);
    }
    const folder = input.folder || "products";
    const assetCategory = input.uploadType || KankanaImageOptimizer.resolveAssetCategory(folder);
    const stagingKey = `staging/${input.userId}/${assetCategory}/${randomUUID()}-${safeName}`;
    const command = new PutObjectCommand({
      Bucket: this.stagingBucket,
      Key: stagingKey,
      ContentType: input.fileType,
    });
    const expiresIn = 300;
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    return { uploadUrl, stagingKey, expiresIn };
  }

  /**
   * Fetch an admin-owned staged object, enforce the size limit before download,
   * then run the exact same image validation/compression/storage path as Multer.
   */
  async finalizeStagedUpload(input: {
    userId: string;
    stagingKey: string;
    folder?: string;
    uploadType?: AssetCategory;
  }): Promise<S3UploadResult> {
    const prefix = `staging/${input.userId}/`;
    if (!input.stagingKey.startsWith(prefix) || input.stagingKey.includes("..")) {
      throw new ImageOptimizationError("SECURITY_VALIDATION_FAILED", "Staging object does not belong to the authenticated uploader.", 403);
    }

    if (!this.stagingBucket) {
      throw new ImageOptimizationError("SECURITY_VALIDATION_FAILED", "Direct uploads require a configured private staging bucket.", 503);
    }
    const head = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.stagingBucket, Key: input.stagingKey }));
    const size = Number(head.ContentLength || 0);
    const maxBytes = 100 * 1024 * 1024;
    if (!size || size > maxBytes) {
      throw new ImageOptimizationError("SIZE_POLICY_VIOLATION", "Staged image is empty or exceeds the 100 MB processing limit.", 413, { sizeBytes: size, limitBytes: maxBytes });
    }

    const response = await this.s3Client.send(new GetObjectCommand({ Bucket: this.stagingBucket, Key: input.stagingKey }));
    if (!response.Body) {
      throw new ImageOptimizationError("INVALID_FILE_TYPE", "Staged image could not be read.", 422);
    }
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    if (bytes.length !== size || bytes.length > maxBytes) {
      throw new ImageOptimizationError("SIZE_POLICY_VIOLATION", "Staged image size verification failed.", 413, { expectedBytes: size, actualBytes: bytes.length });
    }

    const originalName = path.basename(input.stagingKey).replace(/^[0-9a-f-]{36}-/i, "") || "image";
    const fileType = String(head.ContentType || "application/octet-stream");
    const allowedFolders = new Set(["products", "products/variants", "categories", "banners", "home-sections", "bulk"]);
    if (input.folder && !allowedFolders.has(input.folder)) {
      throw new ImageOptimizationError("SECURITY_VALIDATION_FAILED", "Unsupported upload folder.", 400);
    }
    const folder = input.folder || "products";
    const uploadType = input.uploadType;
    const result = await this.uploadFile({
      fieldname: "file",
      originalname: originalName,
      encoding: "7bit",
      mimetype: fileType,
      size: bytes.length,
      buffer: bytes,
      destination: "",
      filename: originalName,
      path: "",
      stream: undefined as any,
    } as Express.Multer.File, folder, uploadType);

    // Remove staging bytes only after the final object has been written.
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.stagingBucket, Key: input.stagingKey }));
    return result;
  }

  /**
   * Upload a file to S3.
   *
   * Images are run through the full Kankana optimisation pipeline:
   *   - Magic-byte input validation (file-type + Sharp metadata)
   *   - Resolution guard (< 600 px → SOURCE_TOO_SMALL / 422)
   *   - Lanczos3 downscale + unsharp-mask (zari / texture preservation)
   *   - Bounded binary-search WebP compression (max 6 attempts)
   *   - Asset-boundary enforcement (min / max bytes per category)
   *   - Magic-byte output verification before upload
   *
   * Videos and all other file types are uploaded as-is without modification.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder?: string,
    uploadTypeOverride?: AssetCategory,
  ): Promise<S3UploadResult> {
    const isProd =
      process.env.NODE_ENV === "production" || process.env.NODE_ENV === "qa";

    const buildUrl = (key: string): string =>
      isProd
        ? `https://d2eb3zuw9j68gk.cloudfront.net/${key}`
        : `${process.env.AWS_S3_ENDPOINT || "http://localhost:4566"}/${this.bucket}/${key}`;

    try {
      // ── IMAGE PATH ──────────────────────────────────────────────────────────
      if (this.isImage(file.mimetype)) {
        const resolvedCategory = KankanaImageOptimizer.resolveAssetCategory(folder) as AssetCategory;
        const assetCategory = uploadTypeOverride && ["product", "category", "banner", "bulk"].includes(uploadTypeOverride)
          ? uploadTypeOverride
          : resolvedCategory;

        // Do not swallow database failures here: silently falling back to compression
        // could violate an administrator's explicit "compression disabled" setting.
        const setting = await this.prisma.imageCompressionSetting.findUnique({
          where: { uploadType: assetCategory },
        });
        const defaultQuality = assetCategory === "category" || assetCategory === "banner" ? 85 : 70;
        const compressionEnabled = setting?.imgCompressionEnabled ?? true;
        const quality = setting?.imgQuality ?? defaultQuality;

        if (!compressionEnabled) {
          // Validate the actual bytes, but never pass them through Sharp or rewrite them.
          const detected = await fileTypeFromBuffer(file.buffer);
          const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/avif"]);
          if (!detected || !allowed.has(detected.mime)) {
            throw new ImageOptimizationError("INVALID_FILE_TYPE", "The uploaded file is not a supported, valid image.", 422);
          }
          const key = this.generateKey(file.originalname || "image", folder);
          await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: detected.mime,
            ContentLength: file.buffer.length,
            CacheControl: "public, max-age=31536000, immutable",
          }));
          const url = buildUrl(key);
          return { url, key, size: file.buffer.length, format: detected.ext };
        }

        console.log(
          `🖼️  Image detected (${(file.size / 1024).toFixed(1)} KB) — optimising as "${assetCategory}" at quality ${quality}…`
        );

        const result = await KankanaImageOptimizer.optimize(file.buffer, assetCategory, quality);
        const key = this.generateKey(file.originalname || "optimized", folder, ".webp");

        await this.s3Client.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: result.buffer,
          ContentType: "image/webp",
          ContentLength: result.size,
          CacheControl: "public, max-age=31536000, immutable",
        }));

        const url = buildUrl(key);
        console.log(
          `✅ Image optimised & uploaded: ${url} ` +
            `(${(result.size / 1024).toFixed(1)} KB, Q${result.qualityUsed}, ${result.attempts} attempt(s))`
        );

        return {
          url,
          key,
          size: result.size,
          width: result.width,
          height: result.height,
          format: "webp",
          qualityUsed: result.qualityUsed,
          attempts: result.attempts,
        };
      }

      // ── VIDEO PATH ──────────────────────────────────────────────────────────
      if (this.isVideo(file.mimetype)) {
        console.log(
          `🎥 Video detected (${(file.size / 1024).toFixed(1)} KB) — uploading as-is`
        );
        const key = this.generateKey(file.originalname, folder);
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentLength: file.size,
            CacheControl: "public, max-age=31536000, immutable",
          })
        );
        const url = buildUrl(key);
        console.log(`✅ Video uploaded: ${url}`);
        return { url, key, size: file.size };
      }

      // ── OTHER FILE PATH ─────────────────────────────────────────────────────
      console.log(`📄 File detected — uploading as-is`);
      const key = this.generateKey(file.originalname, folder);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.size,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      const url = buildUrl(key);
      return { url, key, size: file.size };
    } catch (error) {
      // Re-throw ImageOptimizationError unchanged so the controller can surface
      // the exact error code and 422 status to the client.
      if (error instanceof ImageOptimizationError) {
        throw error;
      }
      console.error("❌ S3 upload failed:", error);
      throw new Error("Failed to upload file");
    }
  }

  /**
   * Upload multiple files concurrently.
   * Each file goes through the same optimisation / upload logic as uploadFile().
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder?: string,
    uploadTypeOverride?: AssetCategory,
  ): Promise<S3UploadResult[]> {
    console.log(`📤 Uploading ${files.length} file(s)…`);
    const uploadPromises = files.map((file) => this.uploadFile(file, folder, uploadTypeOverride));
    return Promise.all(uploadPromises);
  }

  /**
   * Upload a group of files through the same optimizer/S3 pipeline but retain
   * an individual result for every file. One invalid image must not hide the
   * error details for the rest of the batch.
   */
  async uploadFilesWithResults(
    files: Express.Multer.File[],
    folder?: string,
    onFileResult?: (index: number, result: S3UploadFileResult) => Promise<void> | void,
    uploadTypeOverride?: AssetCategory,
  ): Promise<S3UploadFileResult[]> {
    return Promise.all(
      files.map(async (file, index): Promise<S3UploadFileResult> => {
        let fileResult: S3UploadFileResult;
        try {
          const result = await this.uploadFile(file, folder, uploadTypeOverride);
          fileResult = { originalname: file.originalname, success: true, result };
        } catch (error: any) {
          fileResult = {
            originalname: file.originalname,
            success: false,
            error: error instanceof Error ? error.message : String(error || "Unknown upload error"),
          };
        }

        // Report every completed file without making a progress-store failure
        // turn a successful S3 upload into a failed upload.
        if (onFileResult) {
          try {
            await onFileResult(index, fileResult);
          } catch (callbackError) {
            console.warn("Bulk upload progress callback failed:", callbackError);
          }
        }
        return fileResult;
      })
    );
  }

  /**
   * Delete a single file from S3 by key.
   */
  async deleteFile(key: string): Promise<void> {
    try {
      console.log(`🗑️  Deleting: ${key}`);
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      console.log("✅ Deleted successfully");
    } catch (error) {
      console.error("❌ S3 delete failed:", error);
      throw new Error("Failed to delete file");
    }
  }

  /**
   * Delete multiple files from S3 concurrently.
   */
  async deleteFiles(keys: string[]): Promise<void> {
    console.log(`🗑️  Deleting ${keys.length} file(s)…`);
    const deletePromises = keys.map((key) => this.deleteFile(key));
    await Promise.all(deletePromises);
  }

  /**
   * Check if a MIME type represents an image.
   */
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith("image/");
  }

  /**
   * Check if a MIME type represents a video.
   */
  private isVideo(mimeType: string): boolean {
    return mimeType.startsWith("video/");
  }

  /**
   * Generate a unique, sanitised S3 key for the given filename, optional folder,
   * and optional forced extension (e.g. '.webp').
   */
  private generateKey(
    fileName: string,
    folder?: string,
    forcedExtension?: string
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);

    const lastDotIndex = fileName.lastIndexOf(".");
    const baseName =
      lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
    const extension =
      forcedExtension !== undefined
        ? forcedExtension
        : lastDotIndex !== -1
        ? fileName.substring(lastDotIndex)
        : "";

    const sanitizedBase = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 30);

    const safeBase = sanitizedBase || "asset";
    const formattedExt = extension
      ? extension.startsWith(".")
        ? extension
        : `.${extension}`
      : "";

    const key = `${safeBase}-${timestamp}-${random}${formattedExt}`;
    return folder ? `${folder.replace(/^\/+|\/+$/g, "")}/${key}` : key;
  }

  /**
   * Extract the S3 object key from a full S3 or CloudFront URL.
   */
  extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1);
    } catch {
      throw new Error("Invalid S3 URL");
    }
  }
}
