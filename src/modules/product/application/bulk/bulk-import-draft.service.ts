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
 * Drive proxy URLs carry a browser-readable access token for image previews.
 * Never persist those URLs (or temporary Google-hosted thumbnails) in draft
 * parsedData/rawInput. Keep a stable filename/Drive ID reference for retry.
 */
function sanitizeDraftMediaPayload(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeDraftMediaPayload);
  if (!value || typeof value !== "object") return value;

  const next: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) next[key] = sanitizeDraftMediaPayload(child);

  if (
    typeof next.url === "string" &&
    /drive\.google\.com|docs\.google\.com|googleusercontent\.com|\/products\/bulk\/drive-proxy\/|[?&]token=/i.test(next.url)
  ) {
    const url = next.url as string;
    const proxyId = url.match(/\/products\/bulk\/drive-proxy\/([^/?#]+)/)?.[1];
    let id = String(next.sourceDriveFileId || next.key || "");
    if (!id && proxyId) {
      try { id = decodeURIComponent(proxyId); } catch { id = proxyId; }
    }
    next.url = next.title || next.altText || id;
    next.key = next.key || id || undefined;
    next.sourceDriveFileId = next.sourceDriveFileId || id || undefined;
  }

  // Drive match results also contain thumbnailLink, previewUrl, webContentLink
  // and webViewLink fields. They are display/navigation helpers only; omit
  // temporary Google URLs from draft storage because the frontend can rebuild
  // authenticated preview URLs from file.id when rendering.
  for (const key of [
    "thumbnailUrl",
    "thumbnailLink",
    "previewUrl",
    "webContentLink",
    "webViewLink",
  ]) {
    if (
      typeof next[key] === "string" &&
      /drive\.google\.com|docs\.google\.com|googleusercontent\.com|[?&]token=/i.test(next[key])
    ) {
      delete next[key];
    }
  }
  return next;
}

function sanitizeDraftRawInput(rawInput: string | undefined): string | undefined {
  if (rawInput === undefined) return undefined;
  try {
    return JSON.stringify(sanitizeDraftMediaPayload(JSON.parse(rawInput)), null, 2);
  } catch {
    return rawInput.replace(/([?&])token=[^&#\s"'\\]+/g, "$1[redacted]");
  }
}

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
    const safeDto = {
      ...dto,
      rawInput: sanitizeDraftRawInput(dto.rawInput) ?? "",
      parsedData: sanitizeDraftMediaPayload(dto.parsedData),
      products: sanitizeDraftMediaPayload(dto.products),
    };
    const draft = await this.repo.create(userId, safeDto);

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

    const safeRawInput = sanitizeDraftRawInput(
      dto.rawInput !== undefined ? dto.rawInput : existing.rawInput,
    );
    const safeParsedData = sanitizeDraftMediaPayload(updatedParsedData);
    const draft = await this.repo.update(id, {
      ...dto,
      rawInput: safeRawInput,
      parsedData: safeParsedData,
      confirmedAssignments: mergedConfirmed,
      status: dto.status || (safeParsedData?.valid ? "READY_FOR_IMPORT" : "DRAFT"),
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
      rawInput: sanitizeDraftRawInput(existing.rawInput),
      parsedData: sanitizeDraftMediaPayload(validationResult) as any,
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

    const safeTextToParse = sanitizeDraftRawInput(textToParse) || textToParse;
    const parsedRows = BulkProductParser.parseRawText(safeTextToParse);
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
      rawInput: safeTextToParse,
      parsedData: sanitizeDraftMediaPayload(validationResult) as any,
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

  if (!existing) {
    throw new NotFoundError("Draft not found");
  }

  assertOwner(existing.userId, userId);

  if (!existing.parsedData) {
    throw new ValidationError(
      "Draft has no parsed data. Parse the workbook or text before matching images."
    );
  }

  const parsedData = existing.parsedData as any;

  // Support:
  // 1. Validated data: { valid, products: [...] }
  // 2. Parser output: { products, variants, seo, media }
  // 3. Direct product array: [...]
  const productList: any[] = Array.isArray(parsedData)
    ? parsedData
    : Array.isArray(parsedData?.products)
      ? parsedData.products
      : [];

  // Some draft formats store media inside each product/variant.
  // Other formats store every media reference in parsedData.media.
  const collectedMedia: any[] = [];

  for (const product of productList) {
    const productGroupId = product.productGroupId
      ? String(product.productGroupId)
      : undefined;

    if (Array.isArray(product.media)) {
      for (const media of product.media) {
        collectedMedia.push({
          ...media,
          productGroupId:
            media.productGroupId ?? productGroupId,
          variantSku: media.variantSku,
        });
      }
    }

    if (Array.isArray(product.variants)) {
      for (const variant of product.variants) {
        const variantSku = variant.sku ?? variant.variantSku;

        if (!Array.isArray(variant.media)) continue;

        for (const media of variant.media) {
          collectedMedia.push({
            ...media,
            productGroupId:
              media.productGroupId ?? productGroupId,
            variantSku:
              media.variantSku ?? variantSku,
          });
        }
      }
    }
  }

  // Include top-level media references as well. These are important when
  // parsedData came directly from BulkProductParser.parseRawText().
  if (Array.isArray(parsedData?.media)) {
    for (const media of parsedData.media) {
      collectedMedia.push({
        ...media,
        productGroupId: media.productGroupId
          ? String(media.productGroupId)
          : undefined,
        variantSku: media.variantSku
          ? String(media.variantSku)
          : undefined,
      });
    }
  }

  // Deduplicate references appearing in both nested and top-level media.
  // Keep the first occurrence to preserve stable media indices.
  const seenMedia = new Set<string>();
  const allMedia: any[] = [];

  for (const media of collectedMedia) {
    const reference = String(
      media.key ?? media.url ?? media.altText ?? media.title ?? ""
    ).trim();

    const identity = JSON.stringify([
      media.productGroupId ?? "",
      media.variantSku ?? "",
      reference,
      media.order ?? 0,
      media.type ?? "IMAGE",
    ]);

    if (seenMedia.has(identity)) continue;

    seenMedia.add(identity);
    allMedia.push(media);
  }

  if (allMedia.length === 0) {
    throw new ValidationError(
      "No media references were found in this draft. " +
      "Check that product images are provided in products[].media, " +
      "variants[].media, or the top-level media array."
    );
  }

  // Preserve manually confirmed assignments unless a forced rematch
  // was explicitly requested.
  const priorConfirmed: Record<string, string> = dto.forceRematch
    ? {}
    : (
        (existing.confirmedAssignments as
          | Record<string, string>
          | null) ?? {}
      );

  const matchResult = await this.matcher.match(
    userId.toString(),
    dto.folderId,
    allMedia,
    priorConfirmed
  );

  // Store the full matching report for the frontend preview.
  // Do not mark the draft as import-ready while images remain unresolved.
  const unresolved =
    matchResult.missing.length > 0 ||
    matchResult.ambiguous.length > 0;

  const draft = await this.repo.update(id, {
    imageMatches: sanitizeDraftMediaPayload(matchResult) as any,
    parsedData: sanitizeDraftMediaPayload(existing.parsedData),
    rawInput: sanitizeDraftRawInput(existing.rawInput),
    status: unresolved ? "DRAFT" : "READY_FOR_IMPORT",
  });

  return serialise(draft);
}


  // Remove or skip individual products without touching catalog records or storage.
  async updateDraftItems(
    id: string,
    userId: bigint,
    productGroupIds: string[],
    action: "skip" | "delete"
  ): Promise<BulkImportDraftResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);
    if (!productGroupIds.length) throw new ValidationError("Select at least one draft product");

    const parsed = existing.parsedData as any;
    const list: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : [];
    const ids = new Set(productGroupIds.map((value) => String(value).trim()).filter(Boolean));
    const matched = list.filter((product) => ids.has(String(product.productGroupId)));
    if (matched.length !== ids.size) {
      throw new ValidationError("One or more selected products could not be found in this draft. Refresh the draft and try again.");
    }
    if (matched.some((product) => product._importStatus === "success" || product.productId)) {
      throw new ValidationError("A successfully imported product cannot be removed from the draft recovery list.");
    }

    const nextList = action === "delete"
      ? list.filter((product) => !ids.has(String(product.productGroupId)))
      : list.map((product) => ids.has(String(product.productGroupId))
        ? { ...product, _importStatus: "skipped", _importSkipReason: "Skipped by administrator" }
        : product);
    const nextParsed = Array.isArray(parsed) ? nextList : { ...parsed, products: nextList };
    const draft = await this.repo.update(id, {
      parsedData: nextParsed as any,
      rawInput: JSON.stringify(nextParsed, null, 2),
      status: nextList.length === 0 || nextList.every((product) => product._importStatus === "skipped")
        ? "COMPLETED"
        : "DRAFT",
    });
    return serialise(draft);
  }

  // ── Start Background Import from Draft ────────────────────────────────────

  async startImportJob(id: string, userId: bigint): Promise<BulkImportJob> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Draft not found");
    assertOwner(existing.userId, userId);

    // Support both { products: [...] } and flat array [...] formats
    const pd = existing.parsedData as any;
    const productList: any[] = Array.isArray(pd) ? pd : Array.isArray(pd?.products) ? pd.products : [];
    if (!existing.parsedData || productList.length === 0) {
      throw new ValidationError("Draft has no products to import");
    }

    const products = productList.filter((product) => product._importStatus !== "skipped");
    if (products.length === 0) {
      throw new ValidationError("There are no products left to import. All remaining items have been skipped or deleted.");
    }

    // Validate against current catalog state before any Drive download or S3 upload.
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

    return this.jobService.startJob({
      userId: userId.toString(),
      draftId: id,
      products,
      imageMatches: existing.imageMatches as any,
      driveUserId: userId.toString(),
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
