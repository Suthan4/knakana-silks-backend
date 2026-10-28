import { injectable, inject } from "tsyringe";
import { v4 as uuidv4 } from "uuid";
import { Redis } from "ioredis";
import { redisClient } from "@/config/redis.config.js";
import { BulkProductService } from "../service/bulk-product.service.js";
import { BulkImportDraftRepository } from "../../infrastructure/repository/bulk-import-draft.repository.js";
import { DraftStatus as PrismaDraftStatus } from "@/generated/prisma/enums.js";
import type { BulkParsedMedia, BulkParsedProduct } from "./bulk-product.dto.js";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/utils/errors.js";
import { DriveService } from "@/modules/media/infrastructure/drive.service.js";
import { S3UploadService } from "@/config/s3-upload.js";
import type { ImageMatchResult, MatchedEntry } from "./drive-image-matcher.service.js";

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface BulkImportJobItemResult {
  productGroupId: string;
  name: string;
  sku?: string;
  status: "success" | "failed" | "skipped";
  productId?: string;
  error?: string;
}

export type BulkImportJobStage =
  | "preparing_images"
  | "uploading_images"
  | "images_failed"
  | "importing_products"
  | "completed"
  | "failed"
  | "cancelled";

export interface BulkImportImageResult {
  fileId: string;
  name: string;
  status: "success" | "failed";
  url?: string;
  key?: string;
  error?: string;
}

export interface BulkImportJob {
  id: string;
  userId: string;
  draftId?: string;
  status: JobStatus;
  progress: number; // 0 to 100
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: BulkImportJobItemResult[];
  stage: BulkImportJobStage;
  imagesTotal: number;
  imagesProcessed: number;
  imagesUploaded: number;
  imagesFailed: number;
  currentFile?: string;
  imageResults: BulkImportImageResult[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelRequested?: boolean;
}

const JOB_TTL_SECONDS = 86400; // 24 hours

interface UploadedDriveImage {
  url: string;
  key: string;
}

function normalizeDriveReference(value?: string): string {
  if (!value || typeof value !== "string") return "";
  let name = value.trim();
  try {
    const parsed = new URL(name);
    name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || name);
  } catch {
    name = name.split(/[?#]/, 1)[0].split(/[\\/]/).pop() || name;
  }
  name = name.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\.[^.]+$/, "");
  const cameraReference = name.match(/^([a-z]{2,5})[o0](\d{4,})$/);
  return cameraReference ? cameraReference[1] + "0" + cameraReference[2] : name;
}

function isPermanentStorageUrl(value?: string): boolean {
  const raw = (value || "").trim();
  if (!raw || /drive\.google\.com|docs\.google\.com|googleusercontent\.com|\/products\/bulk\/drive-proxy\/|[?&]token=/i.test(raw)) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const isConfiguredCloudFront = host === "d2eb3zuw9j68gk.cloudfront.net";
    const isS3VirtualHosted =
      /^[a-z0-9][a-z0-9.-]*\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i.test(host);
    const isS3PathStyle =
      /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i.test(host) &&
      parsed.pathname.split("/").filter(Boolean).length >= 2;

    // Only canonical permanent storage URLs are publishable media. Arbitrary
    // HTTPS image hosts and signed URLs must go through the upload workflow.
    return (isConfiguredCloudFront || isS3VirtualHosted || isS3PathStyle) &&
      parsed.pathname !== "/";
  } catch {
    return false;
  }
}

function isTemporaryDriveMediaUrl(value?: string): boolean {
  return /drive\.google\.com|docs\.google\.com|googleusercontent\.com|\/products\/bulk\/drive-proxy\/|[?&]token=/i.test(value || "");
}

/**
 * Draft payloads must never persist the authenticated Drive proxy URL/token.
 * If an image has not reached S3 yet, retain only a stable reference that the
 * next job attempt can match using key/sourceDriveFileId and its filename.
 */
function sanitizeTemporaryDriveMedia(products: BulkParsedProduct[]): BulkParsedProduct[] {
  const sanitizeMedia = (media: BulkParsedMedia): BulkParsedMedia => {
    if (isPermanentStorageUrl(media.url)) {
      return {
        ...media,
        thumbnailUrl: isTemporaryDriveMediaUrl(media.thumbnailUrl)
          ? undefined
          : media.thumbnailUrl,
      };
    }

    const currentUrl = (media.url || "").trim();
    const proxyId = currentUrl.match(/\/products\/bulk\/drive-proxy\/([^/?#]+)/)?.[1];
    let sourceId = media.sourceDriveFileId || media.key || "";
    if (!sourceId && proxyId) {
      try { sourceId = decodeURIComponent(proxyId); } catch { sourceId = proxyId; }
    }
    return {
      ...media,
      url: media.title || media.altText || sourceId || "",
      key: media.key || sourceId || undefined,
      sourceDriveFileId: media.sourceDriveFileId || sourceId || undefined,
      thumbnailUrl: undefined,
    };
  };

  return products.map((product) => ({
    ...product,
    media: (product.media || []).map(sanitizeMedia),
    variants: (product.variants || []).map((variant) => ({
      ...variant,
      media: (variant.media || []).map(sanitizeMedia),
    })),
    allImages: (product.allImages || []).map(sanitizeMedia),
  }));
}

function findNonPermanentImageReferences(product: BulkParsedProduct): string[] {
  const bad: string[] = [];
  const collections: Array<{ label: string; media: BulkParsedMedia[] }> = [
    { label: "product", media: product.media || [] },
    ...((product.variants || []).map((variant) => ({
      label: `variant ${variant.sku || "(no SKU)"}`,
      media: variant.media || [],
    }))),
  ];

  for (const collection of collections) {
    for (const media of collection.media) {
      if (media.type !== "IMAGE") continue;
      const url = (media.url || "").trim();
      const hasTemporaryThumbnail = isTemporaryDriveMediaUrl(media.thumbnailUrl);
      if (!url) {
        if (hasTemporaryThumbnail || media.sourceDriveFileId) {
          bad.push(`${collection.label}: ${media.title || media.altText || media.sourceDriveFileId || "image without a stored URL"}`);
        }
        continue;
      }
      if (!isPermanentStorageUrl(url) || isTemporaryDriveMediaUrl(url)) {
        bad.push(`${collection.label}: ${media.title || media.altText || url}`);
      }
    }
  }
  return bad;
}

function mediaMatchesDriveEntry(media: BulkParsedMedia, entry: MatchedEntry): boolean {
  if (media.key === entry.file.id || media.sourceDriveFileId === entry.file.id) return true;
  const refs = new Set(
    [entry.reference, entry.file.name]
      .map(normalizeDriveReference)
      .filter(Boolean)
  );
  return [media.url, media.title, media.altText]
    .some((value) => {
      const key = normalizeDriveReference(value);
      return Boolean(key && refs.has(key));
    });
}

function findDriveEntryTargets(
  products: BulkParsedProduct[],
  entry: MatchedEntry
): BulkParsedMedia[] {
  const productGroupId = entry.productGroupId;
  const variantSku = (entry.variantSku || "").trim().toLocaleLowerCase("en-US");
  const targets: BulkParsedMedia[] = [];

  for (const product of products) {
    if (productGroupId && product.productGroupId !== productGroupId) continue;

    if (variantSku) {
      for (const variant of product.variants || []) {
        if ((variant.sku || "").trim().toLocaleLowerCase("en-US") !== variantSku) continue;
        for (const media of variant.media || []) {
          if (mediaMatchesDriveEntry(media, entry)) targets.push(media);
        }
      }
      // Some drafts store variant photos in product.media with variantSku set.
      for (const media of product.media || []) {
        if ((media.variantSku || "").trim().toLocaleLowerCase("en-US") !== variantSku) continue;
        if (mediaMatchesDriveEntry(media, entry)) targets.push(media);
      }
    } else {
      for (const media of product.media || []) {
        if (media.variantSku || media.source === "variant") continue;
        if (mediaMatchesDriveEntry(media, entry)) targets.push(media);
      }
    }
  }
  return targets;
}

function applyUploadedDriveImages(
  products: BulkParsedProduct[],
  entries: MatchedEntry[],
  uploadedByDriveId: Map<string, UploadedDriveImage>
): BulkParsedProduct[] {
  const updateList = (
    mediaList: BulkParsedMedia[] | undefined,
    productGroupId: string,
    variantSku?: string
  ): BulkParsedMedia[] | undefined => {
    if (!mediaList) return mediaList;
    return mediaList.map((media) => {
      const effectiveVariantSku = variantSku || media.variantSku || "";
      const entry = entries.find((candidate) =>
        candidate.file?.id &&
        (!candidate.productGroupId || candidate.productGroupId === productGroupId) &&
        (candidate.variantSku || "").trim().toLocaleLowerCase("en-US") ===
          effectiveVariantSku.trim().toLocaleLowerCase("en-US") &&
        mediaMatchesDriveEntry(media, candidate) &&
        uploadedByDriveId.has(candidate.file.id)
      );
      if (!entry) return media;
      const stored = uploadedByDriveId.get(entry.file.id);
      if (!stored) return media;
      return {
        ...media,
        url: stored.url,
        key: stored.key,
        sourceDriveFileId: entry.file.id,
        thumbnailUrl: stored.url,
        title: media.title || entry.file.name,
        altText: media.altText || entry.file.name,
        mimeType: "image/webp",
      };
    });
  };

  return products.map((product) => {
    const media = updateList(product.media, product.productGroupId) || [];
    const variants = (product.variants || []).map((variant) => ({
      ...variant,
      media: updateList(variant.media, product.productGroupId, variant.sku) || [],
    }));
    const allImages = [
      ...media.map((item, index) => ({
        ...item,
        source: "product" as const,
        order: item.order ?? index,
      })),
      ...variants.flatMap((variant) =>
        (variant.media || []).map((item, index) => ({
          ...item,
          source: "variant" as const,
          variantSku: variant.sku,
          order: item.order ?? (100 + index),
        }))
      ),
    ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return { ...product, media, variants, allImages };
  });
}



@injectable()
export class BulkImportJobService {
  private redis: Redis | null = null;
  // In-memory fallback if Redis is unavailable
  private memoryStore: Map<string, BulkImportJob> = new Map();
  private userJobs: Map<string, Set<string>> = new Map();

  constructor(
    @inject(BulkProductService) private bulkProductService: BulkProductService,
    @inject(BulkImportDraftRepository) private draftRepo: BulkImportDraftRepository,
    @inject(DriveService) private driveService: DriveService,
    @inject("S3UploadService") private s3UploadService: S3UploadService
  ) {}

  private getRedis(): Redis | null {
    if (process.env.NODE_ENV === "test") return null;
    if (!this.redis) {
      try {
        this.redis = redisClient;
      } catch {
        this.redis = null;
      }
    }
    return this.redis;
  }

  private isRedisReady(): boolean {
    const r = this.getRedis();
    return !!r && (r.status === "ready" || r.status === "connect");
  }

  private getJobKey(jobId: string): string {
    return `bulk_import_job:${jobId}`;
  }

  private async saveJob(job: BulkImportJob): Promise<void> {
    job.updatedAt = new Date().toISOString();

    // Memory store
    this.memoryStore.set(job.id, job);
    if (!this.userJobs.has(job.userId)) {
      this.userJobs.set(job.userId, new Set());
    }
    this.userJobs.get(job.userId)!.add(job.id);

    // Redis store
    const r = this.getRedis();
    if (this.isRedisReady() && r) {
      try {
        await r.set(
          this.getJobKey(job.id),
          JSON.stringify(job),
          "EX",
          JOB_TTL_SECONDS
        );
      } catch (err: any) {
        console.warn("⚠️ Failed to persist bulk job to Redis:", err.message);
      }
    }
  }

  public async getJob(jobId: string, userId: string): Promise<BulkImportJob> {
    let job: BulkImportJob | null = null;

    const r = this.getRedis();
    if (this.isRedisReady() && r) {
      try {
        const raw = await r.get(this.getJobKey(jobId));
        if (raw) job = JSON.parse(raw);
      } catch (err: any) {
        console.warn("⚠️ Redis getJob error:", err.message);
      }
    }

    if (!job) {
      job = this.memoryStore.get(jobId) || null;
    }

    if (!job) {
      throw new NotFoundError(`Bulk import job ${jobId} not found`);
    }

    if (job.userId !== userId) {
      throw new ForbiddenError("You do not have permission to view this job");
    }

    return job;
  }

  /** Request cancellation for a job owned by the current admin. In-flight image
   * batches finish safely; the processor stops before starting the next batch/product. */
  public async cancelJob(jobId: string, userId: string): Promise<BulkImportJob> {
    const authorized = await this.getJob(jobId, userId);
    if (authorized.status === "completed" || authorized.status === "failed" || authorized.status === "cancelled") {
      return authorized;
    }
    const live = this.memoryStore.get(jobId) || authorized;
    live.cancelRequested = true;
    live.error = "Cancellation requested. The current upload or product operation will finish before the job stops.";
    await this.saveJob(live);
    return live;
  }

  private async isCancellationRequested(jobId: string): Promise<boolean> {
    const live = this.memoryStore.get(jobId);
    if (live?.cancelRequested) return true;
    const r = this.getRedis();
    if (this.isRedisReady() && r) {
      try {
        const raw = await r.get(this.getJobKey(jobId));
        if (raw) return Boolean((JSON.parse(raw) as BulkImportJob).cancelRequested);
      } catch (err: any) {
        console.warn("Unable to check bulk cancellation state:", err.message);
      }
    }
    return false;
  }

  private async finishCancelledJob(job: BulkImportJob): Promise<void> {
    job.status = "cancelled";
    job.stage = "cancelled";
    job.currentFile = undefined;
    job.completedAt = new Date().toISOString();
    job.error = "Import cancelled by an administrator. Completed uploads and successfully imported products were kept; review the draft and retry remaining items when ready.";
    await this.saveJob(job);
    if (job.draftId) {
      try {
        await this.draftRepo.update(job.draftId, { status: PrismaDraftStatus.DRAFT });
      } catch (err: any) {
        console.warn("Could not restore draft after cancellation:", err.message);
      }
    }
  }

  /**
   * Start a new background import job
   */
  public async startJob(params: {
    userId: string;
    draftId?: string;
    products: BulkParsedProduct[];
    imageMatches?: ImageMatchResult | null;
    driveUserId?: string;
  }): Promise<BulkImportJob> {
    const { userId, draftId, products, imageMatches, driveUserId } = params;

    if (!products || products.length === 0) {
      throw new ValidationError("No products provided for bulk import job");
    }

    // This is the final server-side safety gate shared by draft imports, direct
    // bulk jobs, and retries. Validate against live catalog state before the
    // background worker can download Drive files or upload anything to S3.
    const preflight = await this.bulkProductService.validateParsedProducts(products);
    const invalid = preflight.products.filter((product) => product.isValid === false);
    if (invalid.length > 0) {
      const details = invalid.slice(0, 4).map((product) => {
        const messages = (product.errors || [])
          .filter((error: any) => error.severity === "error")
          .map((error: any) => error.message);
        return `${product.name || product.productGroupId}: ${messages.join("; ") || "Please correct this product's validation errors"}`;
      });
      throw new ValidationError(
        `Import paused before image upload: ${invalid.length} product(s) need correction. ${details.join(" | ")}`
      );
    }

    const jobId = uuidv4();
    const now = new Date().toISOString();
    const matchedCount = Array.isArray(imageMatches?.matched)
      ? imageMatches!.matched.length
      : 0;

    const job: BulkImportJob = {
      id: jobId,
      userId,
      draftId,
      status: "pending",
      progress: 0,
      total: products.length,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      results: [],
      stage: matchedCount > 0 && driveUserId ? "preparing_images" : "importing_products",
      imagesTotal: matchedCount,
      imagesProcessed: 0,
      imagesUploaded: 0,
      imagesFailed: 0,
      imageResults: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.saveJob(job);

    // Respond immediately; matching images, S3 uploads, and product creation run
    // in the background and write progress to the job store after each batch.
    setImmediate(() => {
      this.executeJob(jobId, products, imageMatches ?? undefined, driveUserId).catch(async (err) => {
        console.error("Background bulk job " + jobId + " crashed:", err);
        const current = this.memoryStore.get(jobId);
        if (current) {
          if (current.cancelRequested) {
            await this.finishCancelledJob(current);
          } else {
            current.status = "failed";
            current.stage =
              current.stage === "preparing_images" || current.stage === "uploading_images"
                ? "images_failed"
                : "failed";
            current.error = err instanceof Error ? err.message : String(err || "Background job crashed");
            current.completedAt = new Date().toISOString();
            current.currentFile = undefined;
            await this.saveJob(current);
          }
        }
      });
    });

    return job;
  }

  /**
   * Background processor
   */
  private async executeJob(
    jobId: string,
    inputProducts: BulkParsedProduct[],
    imageMatches?: ImageMatchResult,
    driveUserId?: string
  ): Promise<void> {
    const rawJob = this.memoryStore.get(jobId);
    if (!rawJob) return;

    let products: BulkParsedProduct[] = inputProducts.map((product) => ({
      ...product,
      media: product.media ? [...product.media] : [],
      variants: (product.variants || []).map((variant) => ({
        ...variant,
        media: variant.media ? [...variant.media] : [],
      })),
    }));

    rawJob.status = "processing";
    rawJob.stage = imageMatches?.matched?.length && driveUserId
      ? "preparing_images"
      : "importing_products";
    await this.saveJob(rawJob);

    // Keep all match associations (a Drive image may be referenced by more
    // than one product), but only download/upload each Drive file ID once.
    const allMatchedEntries = (imageMatches?.matched || []).filter((entry) => Boolean(entry.file?.id));
    const entriesToUploadById = new Map<string, MatchedEntry>();
    const mappingFailures: Array<{ entry: MatchedEntry; error: string }> = [];

    if (driveUserId) {
      for (const entry of allMatchedEntries) {
        const targets = findDriveEntryTargets(products, entry);
        if (targets.length === 0) {
          mappingFailures.push({
            entry,
            error: "The matched Drive file could not be linked to a product image reference. Check the product media URL/title and run matching again.",
          });
          continue;
        }
        // A previously uploaded product image is permanent; retain it on retries.
        if (targets.some((media) => !isPermanentStorageUrl(media.url))) {
          entriesToUploadById.set(entry.file.id, entry);
        }
      }
    }
    const entriesToUpload = [...entriesToUploadById.values()];

    rawJob.imagesTotal = entriesToUpload.length + mappingFailures.length;
    rawJob.imagesProcessed = 0;
    rawJob.imagesUploaded = 0;
    rawJob.imagesFailed = 0;
    rawJob.imageResults = [];
    rawJob.currentFile = undefined;

    for (const failure of mappingFailures) {
      rawJob.imagesProcessed++;
      rawJob.imagesFailed++;
      rawJob.imageResults.push({
        fileId: failure.entry.file.id,
        name: failure.entry.file.name || failure.entry.reference,
        status: "failed",
        error: failure.error,
      });
    }

    const uploadedByDriveId = new Map<string, UploadedDriveImage>();
    // Large camera originals can be 40–60 MB each. Process one source at a time
    // so Drive buffers and Sharp processing do not multiply peak memory usage.
    const batchSize = 1;

    if (entriesToUpload.length > 0 || mappingFailures.length > 0) {
      rawJob.stage = "uploading_images";
      rawJob.progress = rawJob.imagesTotal > 0
        ? Math.round((40 * rawJob.imagesProcessed) / rawJob.imagesTotal)
        : 0;
      if (mappingFailures.length) rawJob.error = mappingFailures.length + " image(s) could not be mapped to product media.";
      await this.saveJob(rawJob);
    }

    for (let offset = 0; offset < entriesToUpload.length; offset += batchSize) {
      if (await this.isCancellationRequested(jobId)) { await this.finishCancelledJob(rawJob); return; }
      const batch = entriesToUpload.slice(offset, offset + batchSize);
      rawJob.currentFile = batch.map((entry) => entry.file.name).join(", ");
      await this.saveJob(rawJob);

      // Download each small batch from the user's connected Drive account.
      const downloads = await Promise.all(
        batch.map(async (entry) => {
          try {
            const file = await this.driveService.downloadFileForImport(driveUserId!, entry.file.id);
            return { entry, file, error: undefined as string | undefined };
          } catch (error) {
            return {
              entry,
              file: undefined,
              error: error instanceof Error ? error.message : String(error || "Google Drive download failed"),
            };
          }
        })
      );

      const validDownloads = downloads.filter(
        (item): item is { entry: MatchedEntry; file: { buffer: Buffer; name: string; mimeType: string; size: number }; error: undefined } =>
          Boolean(item.file)
      );

      for (const failed of downloads.filter((item) => !item.file)) {
        rawJob.imagesProcessed++;
        rawJob.imagesFailed++;
        rawJob.imageResults.push({
          fileId: failed.entry.file.id,
          name: failed.entry.file.name || failed.entry.reference,
          status: "failed",
          error: failed.error || "Could not download the original image from Google Drive.",
        });
      }
      if (downloads.some((item) => !item.file)) {
        rawJob.progress = rawJob.imagesTotal > 0
          ? Math.round((40 * rawJob.imagesProcessed) / rawJob.imagesTotal)
          : 0;
        await this.saveJob(rawJob);
      }

      if (validDownloads.length > 0) {
        const files = validDownloads.map(({ file }) => ({
          fieldname: "files",
          originalname: file.name,
          encoding: "7bit",
          mimetype: file.mimeType,
          buffer: file.buffer,
          size: file.size,
          destination: "",
          filename: file.name,
          path: "",
        } as unknown as Express.Multer.File));

        // This is the backend multi-file upload/optimization path, not 146
        // separate browser POST /upload requests. Each completion is persisted
        // immediately so the admin can see progress while other images run.
        await this.s3UploadService.uploadFilesWithResults(
          files,
          "products",
          async (index, upload) => {
            const item = validDownloads[index];
            if (!item) return;

            rawJob.imagesProcessed++;
            if (upload.success && upload.result?.url && upload.result.key) {
              uploadedByDriveId.set(item.entry.file.id, {
                url: upload.result.url,
                key: upload.result.key,
              });
              rawJob.imagesUploaded++;
              rawJob.imageResults.push({
                fileId: item.entry.file.id,
                name: item.file.name,
                status: "success",
                url: upload.result.url,
                key: upload.result.key,
              });
            } else {
              rawJob.imagesFailed++;
              rawJob.imageResults.push({
                fileId: item.entry.file.id,
                name: item.file.name,
                status: "failed",
                error: upload.error || "S3 image optimizer/upload did not return a storage URL.",
              });
            }

            rawJob.progress = rawJob.imagesTotal > 0
              ? Math.round((40 * rawJob.imagesProcessed) / rawJob.imagesTotal)
              : 0;
            rawJob.currentFile = item.file.name;
            await this.saveJob(rawJob);
          },
          "bulk"
        );
      }

      products = sanitizeTemporaryDriveMedia(
        applyUploadedDriveImages(products, allMatchedEntries, uploadedByDriveId),
      );

      // Persist successful image URLs after each batch. A retry only needs to
      // process images that are still references; successful S3 uploads survive.
      if (rawJob.draftId && uploadedByDriveId.size > 0) {
        await this.draftRepo.update(rawJob.draftId, {
          rawInput: JSON.stringify(products, null, 2),
          parsedData: products,
          status: "READY_FOR_IMPORT",
        });
      }

      rawJob.progress = rawJob.imagesTotal > 0
        ? Math.round((40 * rawJob.imagesProcessed) / rawJob.imagesTotal)
        : 0;
      await this.saveJob(rawJob);
    }

    if (rawJob.imagesFailed > 0) {
      rawJob.status = "failed";
      rawJob.stage = "images_failed";
      rawJob.completedAt = new Date().toISOString();
      rawJob.currentFile = undefined;
      const firstFailures = rawJob.imageResults
        .filter((result) => result.status === "failed")
        .slice(0, 5)
        .map((result) => result.name + ": " + (result.error || "Unknown image error"));
      rawJob.error = rawJob.imagesFailed + " of " + rawJob.imagesTotal +
        " image(s) failed. Product import was not started. " + firstFailures.join(" | ");
      products = sanitizeTemporaryDriveMedia(products);
      if (rawJob.draftId) {
        await this.draftRepo.update(rawJob.draftId, {
          rawInput: JSON.stringify(products, null, 2),
          parsedData: products,
          status: "DRAFT",
        });
      }
      await this.saveJob(rawJob);
      return;
    }

    if (rawJob.draftId && uploadedByDriveId.size > 0) {
      await this.draftRepo.update(rawJob.draftId, {
        rawInput: JSON.stringify(products, null, 2),
        parsedData: products,
        status: "READY_FOR_IMPORT",
      });
    }

    // Never create/update a product with a Drive proxy, Google thumbnail, raw
    // filename, or any other non-permanent image reference. This prevents
    // temporary proxy URLs and access tokens from leaking into ProductMedia.
    const unresolvedMedia = products.flatMap((product) => {
      const references = findNonPermanentImageReferences(product);
      return references.length
        ? [{ product, references }]
        : [];
    });
    if (unresolvedMedia.length > 0) {
      products = sanitizeTemporaryDriveMedia(products);
      const unresolvedReferences = unresolvedMedia.flatMap(({ product, references }) =>
        references.map((reference, index) => ({
          product,
          reference,
          index,
        })),
      );
      const examples = unresolvedMedia
        .slice(0, 5)
        .map(({ product, references }) => `${product.name}: ${references.slice(0, 2).join(", ")}`)
        .join(" | ");

      rawJob.status = "failed";
      rawJob.stage = "images_failed";
      rawJob.completedAt = new Date().toISOString();
      rawJob.currentFile = undefined;
      rawJob.progress = 100;
      rawJob.imagesTotal = Math.max(rawJob.imagesTotal, rawJob.imagesUploaded) + unresolvedReferences.length;
      rawJob.imagesProcessed = Math.max(rawJob.imagesProcessed, rawJob.imagesUploaded) + unresolvedReferences.length;
      rawJob.imagesFailed += unresolvedReferences.length;
      rawJob.imageResults.push(
        ...unresolvedReferences.map(({ product, reference, index }) => ({
          fileId: `unresolved-${product.productGroupId}-${index}`,
          name: `${product.name} — ${reference}`,
          status: "failed" as const,
          error: "This image still uses a filename or temporary Drive URL instead of a permanent storage URL. Run Drive matching again, or remove and re-upload this image.",
        })),
      );
      rawJob.failed = products.length;
      rawJob.processed = products.length;
      rawJob.results = products.map((product) => ({
        productGroupId: product.productGroupId,
        name: product.name,
        sku: product.sku,
        status: "failed" as const,
        error: "Import blocked before product creation because required image references were not uploaded to permanent storage. Fix the image references and retry.",
      }));
      rawJob.error =
        "Import blocked before creating any products: " +
        unresolvedMedia.length +
        " product(s) still contain non-permanent image references. " +
        examples;
      if (rawJob.draftId) {
        await this.draftRepo.update(rawJob.draftId, {
          rawInput: JSON.stringify(products, null, 2),
          parsedData: products,
          status: "DRAFT",
        });
      }
      await this.saveJob(rawJob);
      return;
    }

    if (await this.isCancellationRequested(jobId)) { await this.finishCancelledJob(rawJob); return; }
    rawJob.stage = "importing_products";
    rawJob.currentFile = undefined;
    const imageProgressBase = rawJob.imagesTotal > 0 ? 40 : 0;
    rawJob.progress = imageProgressBase;
    await this.saveJob(rawJob);

    for (let i = 0; i < products.length; i++) {
      if (await this.isCancellationRequested(jobId)) { await this.finishCancelledJob(rawJob); return; }
      const product = products[i];
      rawJob.currentFile = product.name;
      await this.saveJob(rawJob);
      try {
        const res = await this.bulkProductService.importProducts([product]);
        const itemRes = res.results?.[0];

        if (itemRes && itemRes.status === "success") {
          rawJob.successful++;
          rawJob.results.push({
            productGroupId: product.productGroupId,
            name: product.name,
            sku: product.sku,
            status: "success",
            productId: itemRes.productId,
          });
        } else {
          rawJob.failed++;
          rawJob.results.push({
            productGroupId: product.productGroupId,
            name: product.name,
            sku: product.sku,
            status: "failed",
            error: itemRes?.error || "Import validation failed",
          });
        }
      } catch (err: any) {
        rawJob.failed++;
        rawJob.results.push({
          productGroupId: product.productGroupId,
          name: product.name,
          sku: product.sku,
          status: "failed",
          error: err?.message || "Unknown error during product import",
        });
      }

      rawJob.processed++;
      rawJob.progress = imageProgressBase + Math.round(
        ((100 - imageProgressBase) * rawJob.processed) / rawJob.total
      );
      await this.saveJob(rawJob);
    }

    if (await this.isCancellationRequested(jobId)) { await this.finishCancelledJob(rawJob); return; }
    rawJob.completedAt = new Date().toISOString();
    rawJob.progress = 100;
    rawJob.currentFile = undefined;
    // Partial success is not a completed import: keep the draft editable and
    // the failed product results retryable instead of clearing the draft ID.
    const hasFailures = rawJob.failed > 0;
    rawJob.stage = hasFailures ? "failed" : "completed";
    rawJob.status = hasFailures ? "failed" : "completed";
    if (hasFailures) {
      rawJob.error =
        `${rawJob.successful} product(s) imported successfully; ${rawJob.failed} product(s) need attention. Review the per-product errors and use Retry Failed Items.`;
    }
    await this.saveJob(rawJob);

    if (rawJob.draftId) {
      try {
        const finalDraftStatus = hasFailures
          ? PrismaDraftStatus.DRAFT
          : PrismaDraftStatus.COMPLETED;
        await this.draftRepo.update(rawJob.draftId, { status: finalDraftStatus });
      } catch (err: any) {
        console.warn("Failed to update draft " + rawJob.draftId + " on job finish:", err.message);
      }
    }
  }

  /**
   * Safely retry failed items from a previous job
   */
  public async retryJob(jobId: string, userId: string): Promise<BulkImportJob> {
    const parentJob = await this.getJob(jobId, userId);

    if (parentJob.status === "processing") {
      throw new ValidationError("Cannot retry a job that is currently processing");
    }

    const failedGroupIds = new Set(
      parentJob.results.filter((r) => r.status === "failed").map((r) => r.productGroupId)
    );

    if (failedGroupIds.size === 0) {
      throw new ValidationError("There are no failed products to retry in this job");
    }

    // Recover only failed products that still exist in the draft and were not skipped.
    let failedProducts: BulkParsedProduct[] = [];
    let draftPayloadAvailable = false;
    if (parentJob.draftId) {
      const draft = await this.draftRepo.findById(parentJob.draftId);
      if (draft?.parsedData) {
        draftPayloadAvailable = true;
        const parsedData = draft.parsedData as any;
        const productList: BulkParsedProduct[] = Array.isArray(parsedData)
          ? parsedData
          : Array.isArray(parsedData.products)
            ? parsedData.products
            : [];
        failedProducts = productList.filter((product: any) =>
          failedGroupIds.has(product.productGroupId) && product._importStatus !== "skipped"
        );
      }
    }

    if (failedProducts.length === 0 && !draftPayloadAvailable) {
      // Reconstruct minimal representations only when the original draft is unavailable
      failedProducts = parentJob.results
        .filter((r) => r.status === "failed")
        .map((r) => ({
          productGroupId: r.productGroupId,
          name: r.name,
          sku: r.sku,
          categoryPath: "",
          productType: "simple" as const,
          description: "",
          basePrice: 0,
          sellingPrice: 0,
          weight: 500,
          length: 10,
          breadth: 10,
          height: 5,
        }));
    }

    if (failedProducts.length === 0) {
      throw new ValidationError("There are no eligible failed products left to retry. Skipped or deleted draft items are excluded.");
    }

    return this.startJob({
      userId,
      draftId: parentJob.draftId,
      products: failedProducts,
    });
  }
}
