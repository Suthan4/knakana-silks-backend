import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

export class S3UploadService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET!;
  }

  /**
   * Upload file to S3 with automatic image optimization
   * - Images: Auto-resize to 1920x1080, convert to WebP, 80% quality
   * - Videos: Upload as-is (no optimization)
   * - Other files: Upload as-is
   */
  async uploadFile(
    file: Express.Multer.File,
    folder?: string
  ): Promise<{ url: string; key: string }> {
    try {
      let fileBuffer = file.buffer;
      let fileName = file.originalname;
      let contentType = file.mimetype;

      // Optimize ONLY if it's an image (not video)
      if (this.isImage(file.mimetype)) {
        console.log("🖼️  Image detected - optimizing...");
        fileBuffer = await this.optimizeImage(file.buffer);
        fileName = this.changeExtensionToWebp(file.originalname);
        contentType = "image/webp";
        console.log(`✅ Optimized: ${file.size} → ${fileBuffer.length} bytes`);
      } else if (this.isVideo(file.mimetype)) {
        console.log("🎥 Video detected - uploading without optimization...");
        console.log(`📦 Size: ${file.size} bytes`);
        // Videos uploaded as-is, no optimization
      } else {
        console.log("📄 File detected - uploading as-is...");
      }

      // Generate unique key
      const key = this.generateKey(fileName, folder);

      // Upload to S3
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          // Bucket policy handles public access
        })
      );

      // Generate public URL
      const url = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

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
   * Optimize image with Sharp
   * - Resize to max 1920x1080
   * - Convert to WebP
   * - 80% quality
   */
  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(1920, 1080, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
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
   * Generate unique file key
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
   * Change file extension to .webp
   */
  private changeExtensionToWebp(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, ".webp");
  }

  /**
   * Extract key from S3 URL
   */
  extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading /
    } catch (error) {
      throw new Error("Invalid S3 URL");
    }
  }
}
