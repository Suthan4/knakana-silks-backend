import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

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
    folder?: string
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
        const assetCategory = KankanaImageOptimizer.resolveAssetCategory(
          folder
        ) as AssetCategory;

        console.log(
          `🖼️  Image detected (${(file.size / 1024).toFixed(1)} KB) — optimising as "${assetCategory}"…`
        );

        // Full optimisation pipeline — throws ImageOptimizationError on failure
        const result = await KankanaImageOptimizer.optimize(
          file.buffer,
          assetCategory
        );

        // Always store optimised images with a .webp key preserving original slug
        const key = this.generateKey(file.originalname || "optimized", folder, ".webp");

        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: result.buffer,
            ContentType: "image/webp",
            ContentLength: result.size,
            CacheControl: "public, max-age=31536000, immutable",
          })
        );

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
    folder?: string
  ): Promise<S3UploadResult[]> {
    console.log(`📤 Uploading ${files.length} file(s)…`);
    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Upload a group of files through the same optimizer/S3 pipeline but retain
   * an individual result for every file. One invalid image must not hide the
   * error details for the rest of the batch.
   */
  async uploadFilesWithResults(
    files: Express.Multer.File[],
    folder?: string
  ): Promise<S3UploadFileResult[]> {
    return Promise.all(
      files.map(async (file): Promise<S3UploadFileResult> => {
        try {
          const result = await this.uploadFile(file, folder);
          return { originalname: file.originalname, success: true, result };
        } catch (error: any) {
          return {
            originalname: file.originalname,
            success: false,
            error: error instanceof Error ? error.message : String(error || "Unknown upload error"),
          };
        }
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
