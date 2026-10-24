import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

// ============================================================================
// 1. ERROR TYPES & CODES
// ============================================================================

export type ImageErrorCode =
  | "INVALID_FILE_TYPE"
  | "SOURCE_TOO_SMALL"
  | "SIZE_POLICY_VIOLATION"
  | "SECURITY_VALIDATION_FAILED";

export class ImageOptimizationError extends Error {
  public readonly code: ImageErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ImageErrorCode,
    message: string,
    statusCode = 422,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ImageOptimizationError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, ImageOptimizationError.prototype);
  }
}

// ============================================================================
// 2. ASSET BOUNDARIES & TARGET PROFILES
// ============================================================================

export type AssetCategory = "product" | "category" | "bulk" | "banner";

export interface AssetBoundaryConfig {
  minBytes: number;
  maxBytes: number;
  targetBytes: number;
  maxDimension: number;
  initialQuality: number;
  label: string;
}

export const ASSET_BOUNDARIES: Record<AssetCategory, AssetBoundaryConfig> = {
  // Product, Category, and Bulk Uploads: Min 400 KB, Max 800 KB, Target ~600 KB
  product: {
    minBytes: 400 * 1024, // 409,600 bytes
    maxBytes: 800 * 1024, // 819,200 bytes
    targetBytes: 600 * 1024, // 614,400 bytes
    maxDimension: 2600,
    initialQuality: 85,
    label: "Product / Catalog",
  },
  category: {
    minBytes: 400 * 1024,
    maxBytes: 800 * 1024,
    targetBytes: 600 * 1024,
    maxDimension: 2600,
    initialQuality: 85,
    label: "Category Tile",
  },
  bulk: {
    minBytes: 400 * 1024,
    maxBytes: 800 * 1024,
    targetBytes: 600 * 1024,
    maxDimension: 2600,
    initialQuality: 85,
    label: "Bulk Ingestion Asset",
  },
  // Banner Uploads: Min 1.5 MB, Max 2.0 MB, Target ~1.7 MB
  banner: {
    minBytes: Math.round(1.5 * 1024 * 1024), // 1,572,864 bytes
    maxBytes: Math.round(2.0 * 1024 * 1024), // 2,097,152 bytes
    targetBytes: Math.round(1.7 * 1024 * 1024), // 1,782,579 bytes
    maxDimension: 3840,
    initialQuality: 92,
    label: "Hero / Banner",
  },
};

export interface OptimizationResult {
  buffer: Buffer;
  mimeType: "image/webp";
  extension: ".webp";
  size: number;
  width: number;
  height: number;
  qualityUsed: number;
  attempts: number;
  targetBoundary: {
    minBytes: number;
    maxBytes: number;
    targetBytes: number;
  };
}

// ============================================================================
// 3. CORE PHOTO-EDITOR OPTIMIZATION ENGINE
// ============================================================================

export class KankanaImageOptimizer {
  private static readonly MIN_RESOLUTION_PX = 600;
  private static readonly MAX_COMPRESSION_ATTEMPTS = 6;
  private static readonly ALLOWED_SOURCE_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/avif",
  ]);

  /**
   * Resolve appropriate asset configuration from folder name or explicit asset type
   */
  public static resolveAssetCategory(
    folderOrType?: string
  ): AssetCategory {
    if (!folderOrType) return "product";
    const normalized = folderOrType.toLowerCase().trim();
    if (normalized.includes("banner") || normalized.includes("hero")) {
      return "banner";
    }
    if (normalized.includes("category")) {
      return "category";
    }
    if (normalized.includes("bulk")) {
      return "bulk";
    }
    return "product";
  }

  /**
   * Main entrypoint: validates source, applies Lanczos3 + unsharp mask + WebP chroma settings,
   * performs bounded iterative quality stepping, and deeply verifies magic bytes.
   */
  public static async optimize(
    sourceBuffer: Buffer,
    assetCategory: AssetCategory = "product"
  ): Promise<OptimizationResult> {
    const config = ASSET_BOUNDARIES[assetCategory] || ASSET_BOUNDARIES.product;

    // ── STEP 1: Deep Security Validation on Input Buffer ────────────────────
    const detectedType = await fileTypeFromBuffer(sourceBuffer);
    if (!detectedType || !this.ALLOWED_SOURCE_MIMES.has(detectedType.mime)) {
      throw new ImageOptimizationError(
        "INVALID_FILE_TYPE",
        `Security validation failed: Detected magic bytes mismatch or unsupported format (${
          detectedType?.mime || "unknown/corrupted"
        }). Supported formats: JPEG, PNG, WebP, TIFF, AVIF.`,
        422,
        { detectedMime: detectedType?.mime || null }
      );
    }

    // ── STEP 2: Sharp Metadata Introspection & Resolution Guardrails ────────
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(sourceBuffer).metadata();
    } catch (err: any) {
      throw new ImageOptimizationError(
        "INVALID_FILE_TYPE",
        `Corrupt image payload: Sharp failed to parse metadata. ${err.message}`,
        422
      );
    }

    const { width, height } = metadata;
    if (!width || !height) {
      throw new ImageOptimizationError(
        "INVALID_FILE_TYPE",
        "Could not determine image dimensions from source buffer.",
        422
      );
    }

    // STRICT GUARDRAIL: No artificial upscaling or low-res source files (< 600px)
    if (width < this.MIN_RESOLUTION_PX || height < this.MIN_RESOLUTION_PX) {
      throw new ImageOptimizationError(
        "SOURCE_TOO_SMALL",
        `Source image resolution (${width}×${height}px) is below the required ${this.MIN_RESOLUTION_PX}×${this.MIN_RESOLUTION_PX}px threshold for Kankana Silks luxury cataloging. Artificial upscaling or synthetic noise inflation is strictly prohibited.`,
        422,
        { width, height, minRequired: this.MIN_RESOLUTION_PX }
      );
    }

    // ── STEP 3: Studio Photo-Editor Pipeline for Silk Weave & Zari ───────────
    // Golden Rule: All editing operations occur in linear memory on the raw
    // uncompressed buffer in a single pass BEFORE lossy WebP quantization.
    const needsDownscale =
      width > config.maxDimension || height > config.maxDimension;

    // 1. Auto-Orientation: Fix mobile/camera EXIF orientation tags
    let basePipeline = sharp(sourceBuffer, { failOnError: true })
      .rotate();

    // 2. Color Space Normalization: Ensure accurate color rendering across OLED and Retina displays
    basePipeline = basePipeline.toColorspace("srgb");

    // 3. High-Precision Resampling: Downscale with Lanczos3 to prevent soft or blurry thread details
    if (needsDownscale) {
      basePipeline = basePipeline.resize({
        width: config.maxDimension,
        height: config.maxDimension,
        fit: sharp.fit.inside,
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      });
    }

    // 4. Dynamic Range Expansion: Stretch contrast across full 8-bit range without blowing out zari
    basePipeline = basePipeline.normalize();

    // 5. CLAHE (Contrast Limited Adaptive Histogram Equalization):
    // Pull out 3D thread depth in deep saree folds and intricate jacquard brocades
    basePipeline = basePipeline.clahe({
      width: 100,
      height: 100,
      maxSlope: 2,
    });

    // 6. Silk Luster & Chroma Calibration:
    // Restore chemical/vegetable dye vibrancy (Peacock Blue, Rani Pink, Emerald Green) and mulberry sheen
    basePipeline = basePipeline.modulate({
      brightness: 1.01,
      saturation: 1.06,
    });

    // 7. Targeted Zari Unsharp Mask:
    // Crisp up metallic zari borders and fine embroidery without dark halos or ringing artifacts
    basePipeline = basePipeline.sharpen({
      sigma: 0.8,
      m1: 1.0,
      m2: 2.0,
    });

    // ── STEP 4: Bounded Iterative Compression (Max 6 attempts) ──────────────
    let attempts = 0;
    let minQ = 45;
    let maxQ = 100;
    let currentQ = config.initialQuality;

    let bestValidBuffer: Buffer | null = null;
    let bestValidQuality = currentQ;
    let bestValidDiff = Infinity;

    let closestCandidateBuffer: Buffer | null = null;
    let closestCandidateQuality = currentQ;
    let closestCandidateDiff = Infinity;

    while (attempts < this.MAX_COMPRESSION_ATTEMPTS) {
      attempts++;

      const candidateBuffer = await basePipeline
        .clone()
        .webp({
          quality: currentQ,
          effort: 6,
          smartSubsample: true, // Prevents gold/silver zari bleeding into rich fabrics
        })
        .toBuffer();

      const candidateSize = candidateBuffer.length;
      const diffFromTarget = Math.abs(candidateSize - config.targetBytes);

      if (diffFromTarget < closestCandidateDiff) {
        closestCandidateDiff = diffFromTarget;
        closestCandidateBuffer = candidateBuffer;
        closestCandidateQuality = currentQ;
      }

      // Check if candidate strictly lands within the allowable asset boundaries
      const isWithinBounds =
        candidateSize >= config.minBytes && candidateSize <= config.maxBytes;

      if (isWithinBounds) {
        if (diffFromTarget < bestValidDiff) {
          bestValidDiff = diffFromTarget;
          bestValidBuffer = candidateBuffer;
          bestValidQuality = currentQ;
        }

        // Target convergence check: if within 5% of targetBytes, break early
        if (diffFromTarget <= config.targetBytes * 0.05) {
          break;
        }

        // Steer towards targetBytes within allowable boundary
        if (candidateSize < config.targetBytes) {
          minQ = currentQ + 1;
        } else {
          maxQ = currentQ - 1;
        }
      } else {
        // Outside boundaries: adjust bounds to navigate towards the window
        if (candidateSize > config.maxBytes) {
          maxQ = currentQ - 1;
        } else {
          minQ = currentQ + 1;
        }
      }

      if (minQ > maxQ) {
        break;
      }

      currentQ = Math.round((minQ + maxQ) / 2);
    }

    // ── STEP 5: Validate Final File Size Against Boundary Policy ────────────
    const finalBuffer = bestValidBuffer;
    const finalQuality = bestValidQuality;

    if (!finalBuffer) {
      const fallbackBuffer = closestCandidateBuffer;
      const fallbackSize = fallbackBuffer ? fallbackBuffer.length : 0;

      if (fallbackSize < config.minBytes) {
        throw new ImageOptimizationError(
          "SIZE_POLICY_VIOLATION",
          `Source image cannot meet the minimum required asset boundary of ${(
            config.minBytes / 1024
          ).toFixed(0)} KB for ${config.label} (achieved ${(
            fallbackSize / 1024
          ).toFixed(
            1
          )} KB at quality Q=${closestCandidateQuality}). Artificial padding, synthetic noise, or upscaling is strictly forbidden. Please provide a higher-resolution master photograph with richer detail.`,
          422,
          {
            achievedBytes: fallbackSize,
            minRequiredBytes: config.minBytes,
            qualityAttempted: closestCandidateQuality,
            attempts,
          }
        );
      }

      throw new ImageOptimizationError(
        "SIZE_POLICY_VIOLATION",
        `Image cannot be compressed below the maximum asset boundary of ${(
          config.maxBytes / 1024
        ).toFixed(0)} KB for ${config.label} (achieved ${(
          fallbackSize / 1024
        ).toFixed(
          1
        )} KB at quality Q=${closestCandidateQuality}) without compromising luxury silk saree thread integrity.`,
        422,
        {
          achievedBytes: fallbackSize,
          maxAllowedBytes: config.maxBytes,
          qualityAttempted: closestCandidateQuality,
          attempts,
        }
      );
    }

    const finalSize = finalBuffer.length;

    // ── STEP 6: Deep Security Verification of Output WebP Magic Bytes ───────
    const finalFileType = await fileTypeFromBuffer(finalBuffer);
    if (!finalFileType || finalFileType.mime !== "image/webp") {
      throw new ImageOptimizationError(
        "SECURITY_VALIDATION_FAILED",
        `Output binary security check failed: Magic bytes do not match 'image/webp' (detected: ${
          finalFileType?.mime || "unknown"
        }). File renaming alone is strictly insufficient.`,
        422,
        { detectedMime: finalFileType?.mime || null }
      );
    }

    const finalMetadata = await sharp(finalBuffer).metadata();
    if (finalMetadata.format !== "webp") {
      throw new ImageOptimizationError(
        "SECURITY_VALIDATION_FAILED",
        `Output container introspection failed: format '${finalMetadata.format}' is not WebP.`,
        422
      );
    }

    return {
      buffer: finalBuffer,
      mimeType: "image/webp",
      extension: ".webp",
      size: finalSize,
      width: finalMetadata.width || width,
      height: finalMetadata.height || height,
      qualityUsed: finalQuality,
      attempts,
      targetBoundary: {
        minBytes: config.minBytes,
        maxBytes: config.maxBytes,
        targetBytes: config.targetBytes,
      },
    };
  }
}

