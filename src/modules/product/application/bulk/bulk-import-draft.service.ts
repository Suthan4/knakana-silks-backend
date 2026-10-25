import { injectable, inject } from "tsyringe";
import { BulkImportDraftRepository } from "../../infrastructure/repository/bulk-import-draft.repository.js";
import { BulkProductParser } from "./bulk-product.parser.js";
import { BulkProductValidator } from "./bulk-product.validator.js";
import { BulkProductService } from "../service/bulk-product.service.js";
import { DriveImageMatcherService } from "./drive-image-matcher.service.js";
import { BulkImportJobService, BulkImportJob } from "./bulk-import-job.service.js";
import { PrismaClient } from "@/generated/prisma/client.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/utils/errors.js";
import type {
  CreateBulkImportDraftDto,
  UpdateBulkImportDraftDto,
  MatchDriveDto,
  BulkImportDraftResponse,
} from "./dto/bulk-import-draft.dto.js";

/**
 * Orchestrates draft lifecycle:
 *   create → parse/validate → match images → (user corrects) → background import
 *
 * Draft operations NEVER create products or variants in the database.
 */
@injectable()
export class BulkImportDraftService {
  constructor(
    @inject(BulkImportDraftRepository)
    private repo: BulkImportDraftRepository,
    @inject(DriveImageMatcherService)
    private matcher: DriveImageMatcherService,
    @inject(BulkProductService)
    private bulkProductService: BulkProductService,
    @inject(BulkImportJobService)
    private jobService: BulkImportJobService,
    @inject(PrismaClient)
    private prisma: PrismaClient
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async createDraft(
    userId: bigint,
    dto: CreateBulkImportDraftDto
  ): Promise<BulkImportDraftResponse> {
    const draft = await this.repo.create(userId, dto);

    // If caller provided structured parsedData or products directly, keep it
    if (dto.parsedData || dto.products) {
      return serialise(draft);
    }

    // If rawInput was supplied without parsedData, try parsing & validating it right away
    if (dto.rawInput && dto.rawInput.trim().length > 0) {
      try {
        return await this.parseRawInput(draft.id, userId, dto.rawInput);
      } catch (err: any) {
        console.warn("Auto-parse on create draft skipped:", err.message);
      }
    }

    return serialise(draft);
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async listDrafts(userId: bigint): Promise<BulkImportDraftResponse[]> {
    const drafts = await this.repo.findAllByUser(userId);
    return drafts.map(serialise);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getDraft(
    id: string,
    userId: bigint
  ): Promise<BulkImportDraftResponse> {
    const draft = await this.repo.findById(id);
    if (!draft) throw new NotFoundError("Draft not found");
    assertOwner(draft.userId, userId);
    return serialise(draft);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateDraft(
    id: string,
    userId: bigint,
    dto: UpdateBulkImportDraftDto
  ): Promise<BulkImportDraftResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);

    if (existing.status === "COMPLETED") {
      throw new ValidationError("Draft has already been imported and completed");
    }

    // Merge confirmed assignments – never silently drop prior confirmations
    const mergedConfirmed = {
      ...((existing.confirmedAssignments as Record<string, string> | null) ?? {}),
      ...(dto.confirmedAssignments ?? {}),
    };

    let updatedParsedData =
      dto.parsedData !== undefined
        ? dto.parsedData
        : dto.products !== undefined
        ? { products: dto.products }
        : existing.parsedData;

    // If rawInput changed and parsedData/products was not explicitly supplied, re-parse raw input
    if (
      dto.rawInput &&
      dto.rawInput !== existing.rawInput &&
      dto.parsedData === undefined &&
      dto.products === undefined
    ) {
      try {
        const parsedRows = BulkProductParser.parseRawText(dto.rawInput);
        const { flatList: categoryList } = await this.bulkProductService.getCategoryHierarchy();
        const warehouseList = await this.bulkProductService.getWarehouseLookupList();

        updatedParsedData = await BulkProductValidator.validate({
          prisma: this.prisma,
          products: parsedRows.products,
          variants: parsedRows.variants,
          seo: parsedRows.seo,
          media: parsedRows.media,
          categoryList,
          warehouseList,
        });
      } catch (err: any) {
        console.warn("Re-parse on updateDraft failed:", err.message);
      }
    }

    const draft = await this.repo.update(id, {
      ...dto,
      rawInput: dto.rawInput !== undefined ? dto.rawInput : existing.rawInput,
      parsedData: updatedParsedData,
      confirmedAssignments: mergedConfirmed,
      status: dto.status || (updatedParsedData?.valid ? "READY_FOR_IMPORT" : "DRAFT"),
    });

    return serialise(draft);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteDraft(id: string, userId: bigint): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);
    await this.repo.delete(id);
  }

  // ── Parse & Validate (Excel Buffer) ────────────────────────────────────────

  async parseAndValidate(
    id: string,
    userId: bigint,
    buffer: Buffer
  ): Promise<BulkImportDraftResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);

    const validationResult = await this.bulkProductService.validateWorkbookBuffer(buffer);

    const draft = await this.repo.update(id, {
      parsedData: validationResult as any,
      status: validationResult.valid ? "READY_FOR_IMPORT" : "DRAFT",
    });

    return serialise(draft);
  }

  // ── Parse & Validate Raw Text Input ───────────────────────────────────────

  async parseRawInput(
    id: string,
    userId: bigint,
    rawText?: string
  ): Promise<BulkImportDraftResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);

    const textToParse = rawText !== undefined ? rawText : existing.rawInput;
    if (!textToParse || textToParse.trim().length === 0) {
      throw new ValidationError("Raw input text is empty");
    }

    const parsedRows = BulkProductParser.parseRawText(textToParse);
    const { flatList: categoryList } = await this.bulkProductService.getCategoryHierarchy();
    const warehouseList = await this.bulkProductService.getWarehouseLookupList();

    const validationResult = await BulkProductValidator.validate({
      prisma: this.prisma,
      products: parsedRows.products,
      variants: parsedRows.variants,
      seo: parsedRows.seo,
      media: parsedRows.media,
      categoryList,
      warehouseList,
    });

    const draft = await this.repo.update(id, {
      rawInput: textToParse,
      parsedData: validationResult as any,
      status: validationResult.valid ? "READY_FOR_IMPORT" : "DRAFT",
    });

    return serialise(draft);
  }

  // ── Match Drive ───────────────────────────────────────────────────────────

  async matchDrive(
    id: string,
    userId: bigint,
    dto: MatchDriveDto
  ): Promise<BulkImportDraftResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);

    if (!existing.parsedData) {
      throw new ValidationError(
        "Draft has no parsed data. Parse the workbook or text before matching images."
      );
    }

    // Collect all media references from parsed products and variants
    const parsedData = existing.parsedData as any;
    const allMedia: any[] = [];
    if (Array.isArray(parsedData.products)) {
      for (const p of parsedData.products) {
        if (Array.isArray(p.media)) {
          p.media.forEach((m: any) => allMedia.push({ ...m, productGroupId: p.productGroupId }));
        }
        if (Array.isArray(p.variants)) {
          for (const v of p.variants) {
            if (Array.isArray(v.media)) {
              v.media.forEach((m: any) =>
                allMedia.push({ ...m, productGroupId: p.productGroupId, variantSku: v.sku })
              );
            }
          }
        }
      }
    }

    // Preserve prior confirmed assignments unless forceRematch
    const priorConfirmed: Record<string, string> = dto.forceRematch
      ? {}
      : ((existing.confirmedAssignments as Record<string, string> | null) ?? {});

    const matchResult = await this.matcher.match(
      userId.toString(),
      dto.folderId,
      allMedia,
      priorConfirmed
    );

    // Persist matching results in BulkImportDraft.imageMatches
    const draft = await this.repo.update(id, {
      imageMatches: matchResult as any,
      status: "READY_FOR_IMPORT",
    });

    return serialise(draft);
  }

  // ── Start Background Import from Draft ────────────────────────────────────

  async startImportJob(id: string, userId: bigint): Promise<BulkImportJob> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);

    if (!existing.parsedData || !Array.isArray(existing.parsedData.products)) {
      throw new ValidationError("Draft has no products to import");
    }

    const products = existing.parsedData.products;
    if (products.length === 0) {
      throw new ValidationError("No products in draft to import");
    }

    return this.jobService.startJob({
      userId: userId.toString(),
      draftId: id,
      products,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertOwner(draftUserId: bigint, requestUserId: bigint): void {
  if (draftUserId !== requestUserId) {
    throw new ForbiddenError("You do not have access to this draft");
  }
}

function serialise(draft: any): BulkImportDraftResponse {
  return {
    id: draft.id,
    userId: draft.userId.toString(),
    rawInput: draft.rawInput,
    parsedData: draft.parsedData,
    imageMatches: draft.imageMatches,
    confirmedAssignments: draft.confirmedAssignments,
    status: draft.status,
    createdAt:
      draft.createdAt instanceof Date ? draft.createdAt.toISOString() : String(draft.createdAt),
    updatedAt:
      draft.updatedAt instanceof Date ? draft.updatedAt.toISOString() : String(draft.updatedAt),
  };
}
