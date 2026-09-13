import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

export class S3UploadService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
   const isProd = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "qa";

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
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        console.log(`🪣 Created missing local S3 bucket: ${this.bucket}`);
      } catch (err) {
        console.error("Failed to auto-create local S3 bucket:", err);
      }
    }
  }

  /**
   * Upload file to S3 — no optimization, original quality preserved.
   * Premium luxury products require exact color fidelity and full resolution.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder?: string
  ): Promise<{ url: string; key: string }> {
    try {
      const fileBuffer = file.buffer;
      const fileName = file.originalname;
      const contentType = file.mimetype;

      if (this.isImage(file.mimetype)) {
        console.log(`🖼️  Image detected — uploading original (${file.size} bytes, no optimization)`);
      } else if (this.isVideo(file.mimetype)) {
        console.log(`🎥 Video detected — uploading original (${file.size} bytes)`);
      } else {
        console.log(`📄 File detected — uploading as-is`);
      }

      const key = this.generateKey(fileName, folder);

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
        })
      );

      // URL Generation: Production first, Dev/LocalStack in else
      const isProd = process.env.NODE_ENV === "production";
      const url = isProd
        ? `https://d2eb3zuw9j68gk.cloudfront.net/${key}`
        : `${process.env.AWS_S3_ENDPOINT || "http://localhost:4566"}/${this.bucket}/${key}`;
      console.log(`✅ Uploaded: ${url}`);
      return { url, key };
    } catch (error) {
      console.error("❌ S3 upload failed:", error);
      throw new Error("Failed to upload file");
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder?: string
  ): Promise<Array<{ url: string; key: string }>> {
    console.log(`📤 Uploading ${files.length} files...`);
    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Delete file from S3
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
   * Delete multiple files
   */
  async deleteFiles(keys: string[]): Promise<void> {
    console.log(`🗑️  Deleting ${keys.length} files...`);
    const deletePromises = keys.map((key) => this.deleteFile(key));
    await Promise.all(deletePromises);
  }

  /**
   * Check if file is an image
   */
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith("image/");
  }

  /**
   * Check if file is a video
   */
  private isVideo(mimeType: string): boolean {
    return mimeType.startsWith("video/");
  }

  /**
   * Generate unique file key — preserves original filename & extension
   */
  private generateKey(fileName: string, folder?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const sanitized = fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "-")
      .substring(0, 30);

    const key = `${sanitized}-${timestamp}-${random}`;
    return folder ? `${folder}/${key}` : key;
  }

  /**
   * Extract key from S3 URL
   */
  extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1);
    } catch (error) {
      throw new Error("Invalid S3 URL");
    }
  }
}