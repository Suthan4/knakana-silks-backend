import { injectable, inject } from "tsyringe";
import { v4 as uuidv4 } from "uuid";
import { Redis } from "ioredis";
import { redisClient } from "@/config/redis.config.js";
import { BulkProductService } from "../service/bulk-product.service.js";
import { BulkImportDraftRepository } from "../../infrastructure/repository/bulk-import-draft.repository.js";
import { DraftStatus as PrismaDraftStatus } from "@/generated/prisma/enums.js";
import type { BulkParsedProduct } from "./bulk-product.dto.js";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/utils/errors.js";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface BulkImportJobItemResult {
  productGroupId: string;
  name: string;
  sku?: string;
  status: "success" | "failed" | "skipped";
  productId?: string;
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
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

const JOB_TTL_SECONDS = 86400; // 24 hours

@injectable()
export class BulkImportJobService {
  private redis: Redis | null = null;
  // In-memory fallback if Redis is unavailable
  private memoryStore: Map<string, BulkImportJob> = new Map();
  private userJobs: Map<string, Set<string>> = new Map();

  constructor(
    @inject(BulkProductService) private bulkProductService: BulkProductService,
    @inject(BulkImportDraftRepository) private draftRepo: BulkImportDraftRepository
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

  /**
   * Start a new background import job
   */
  public async startJob(params: {
    userId: string;
    draftId?: string;
    products: BulkParsedProduct[];
  }): Promise<BulkImportJob> {
    const { userId, draftId, products } = params;

    if (!products || products.length === 0) {
      throw new ValidationError("No products provided for bulk import job");
    }

    const jobId = uuidv4();
    const now = new Date().toISOString();

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
      createdAt: now,
      updatedAt: now,
    };

    await this.saveJob(job);

    // Run in background asynchronously (never block HTTP request)
    setImmediate(() => {
      this.executeJob(jobId, products).catch((err) => {
        console.error(`❌ Background import job ${jobId} crashed:`, err);
      });
    });

    return job;
  }

  /**
   * Background processor
   */
  private async executeJob(jobId: string, products: BulkParsedProduct[]): Promise<void> {
    const rawJob = this.memoryStore.get(jobId);
    if (!rawJob) return;

    rawJob.status = "processing";
    await this.saveJob(rawJob);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      try {
        // Import single product transactionally
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
          error: err.message || "Unknown error during product import",
        });
      }

      rawJob.processed++;
      rawJob.progress = Math.round((rawJob.processed / rawJob.total) * 100);

      // Periodically persist progress
      await this.saveJob(rawJob);
    }

    // Finalize job
    rawJob.completedAt = new Date().toISOString();
    rawJob.progress = 100;
    rawJob.status = rawJob.failed === 0 ? "completed" : (rawJob.successful > 0 ? "completed" : "failed");

    await this.saveJob(rawJob);

    // If linked to draft, update draft status
    if (rawJob.draftId) {
      try {
        const finalDraftStatus =
          rawJob.successful > 0 ? PrismaDraftStatus.COMPLETED : PrismaDraftStatus.FAILED;
        await this.draftRepo.update(rawJob.draftId, {
          status: finalDraftStatus,
        });
      } catch (err: any) {
        console.warn(`Failed to update draft ${rawJob.draftId} on job finish:`, err.message);
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

    // Find original product details from draft if available
    let failedProducts: BulkParsedProduct[] = [];
    if (parentJob.draftId) {
      const draft = await this.draftRepo.findById(parentJob.draftId);
      if (draft && draft.parsedData && Array.isArray(draft.parsedData.products)) {
        failedProducts = draft.parsedData.products.filter((p: BulkParsedProduct) =>
          failedGroupIds.has(p.productGroupId)
        );
      }
    }

    if (failedProducts.length === 0) {
      // Reconstruct minimal representations if draft is not available
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

    return this.startJob({
      userId,
      draftId: parentJob.draftId,
      products: failedProducts,
    });
  }
}
