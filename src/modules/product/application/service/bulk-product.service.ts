import { injectable, inject } from "tsyringe";
import { PrismaClient } from "@/generated/prisma/client.js";
import { ICategoryRepository } from "@/modules/category/infrastructure/interface/Icategoryrepository.js";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { ProductService } from "./product.service.js";
import { BulkTemplateGenerator, CategoryLookupItem, WarehouseLookupItem } from "../bulk/bulk-template.generator.js";
import { BulkProductParser } from "../bulk/bulk-product.parser.js";
import { BulkProductValidator, CategoryCacheInfo, WarehouseCacheInfo } from "../bulk/bulk-product.validator.js";
import {
  BulkParsedProduct,
  BulkValidationResponse,
  BulkImportResponse,
  BulkProductRow,
  BulkVariantRow,
  BulkSeoRow,
  BulkMediaRow,
} from "../bulk/bulk-product.dto.js";
import { CreateProductDTO, UpdateProductDTO } from "../product.dto.js";
import { MediaType } from "@/generated/prisma/enums.js";
import { ValidationError } from "@/shared/utils/errors.js";

export interface HierarchicalCategoryNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  isLeaf: boolean;
  isActive: boolean;
  parentId?: string | null;
  children: HierarchicalCategoryNode[];
}

@injectable()
export class BulkProductService {
  constructor(
    @inject(PrismaClient) private prisma: PrismaClient,
    @inject("ICategoryRepository") private categoryRepository: ICategoryRepository,
    @inject("IWarehouseRepository") private warehouseRepository: IWarehouseRepository,
    @inject(ProductService) private productService: ProductService
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CATEGORY HIERARCHY & PATH RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieves all categories, resolves their full paths (e.g. Sarees > Pure Silk > Kanchipuram),
   * and builds both a tree structure and a flattened lookup list.
   */
  public async getCategoryHierarchy(): Promise<{
    tree: HierarchicalCategoryNode[];
    flatList: CategoryCacheInfo[];
  }> {
    const rawCategories = await this.prisma.category.findMany({
      orderBy: { order: "asc" },
      include: {
        parentPlacements: { include: { parent: true } },
        childPlacements: { include: { child: true }, orderBy: { order: "asc" } },
      },
    });

    const categoryMap = new Map<string, any>();
    for (const c of rawCategories) {
      categoryMap.set(c.id.toString(), c);
    }

    // Helper to build full path for any category
    const buildPath = (catId: string, visited = new Set<string>()): string => {
      if (visited.has(catId)) return "";
      visited.add(catId);

      const cat = categoryMap.get(catId);
      if (!cat) return "";

      // Check placement parent first, then legacy parentId
      const parentPlacement = cat.parentPlacements?.[0];
      const parentId = parentPlacement ? parentPlacement.parentId.toString() : cat.parentId?.toString();

      if (parentId && categoryMap.has(parentId)) {
        const parentPath = buildPath(parentId, visited);
        return parentPath ? `${parentPath} > ${cat.name}` : cat.name;
      }
      return cat.name;
    };

    const flatList: CategoryCacheInfo[] = rawCategories.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      slug: c.slug,
      path: buildPath(c.id.toString()),
      isActive: c.isActive,
    }));

    // Build hierarchical tree
    const rootCategories = rawCategories.filter((c) => {
      const hasParentPlacement = c.parentPlacements && c.parentPlacements.length > 0;
      return (!c.parentId && !hasParentPlacement) || c.isRoot;
    });

    const buildNode = (
      cat: any,
      level = 0,
      visited = new Set<string>()
    ): HierarchicalCategoryNode => {
      const catId = cat.id.toString();
      visited.add(catId);

      const childNodes: HierarchicalCategoryNode[] = [];
      const placements = cat.childPlacements || [];

      for (const p of placements) {
        const childId = p.childId.toString();
        if (!visited.has(childId) && categoryMap.has(childId)) {
          const childCat = categoryMap.get(childId);
          childNodes.push(buildNode(childCat, level + 1, new Set(visited)));
        }
      }

      return {
        id: catId,
        name: cat.name,
        slug: cat.slug,
        path: buildPath(catId),
        level,
        isLeaf: childNodes.length === 0,
        isActive: cat.isActive,
        parentId: cat.parentId?.toString(),
        children: childNodes,
      };
    };

    const tree = rootCategories.map((r) => buildNode(r, 0));

    return { tree, flatList };
  }

  /**
   * Retrieves active warehouses for bulk upload.
   */
  public async getWarehouseLookupList(): Promise<WarehouseCacheInfo[]> {
    const raw = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: [{ isDefaultPickup: "desc" }, { name: "asc" }],
    });

    return raw.map((w) => ({
      id: w.id.toString(),
      name: w.name,
      code: w.code,
      isActive: w.isActive,
      isDefaultPickup: w.isDefaultPickup,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. TEMPLATE GENERATION & EXPORT
  // ─────────────────────────────────────────────────────────────────────────────

  public async generateTemplate(categoryIds?: string[]): Promise<Buffer> {
    const { flatList: allCategories } = await this.getCategoryHierarchy();
    const allWarehouses = await this.getWarehouseLookupList();

    let targetCategories = allCategories.filter((c) => c.isActive);
    if (categoryIds && categoryIds.length > 0) {
      const idSet = new Set(categoryIds);
      const filtered = targetCategories.filter((c) => idSet.has(c.id));
      if (filtered.length > 0) {
        targetCategories = filtered;
      }
    }

    const categoryLookup: CategoryLookupItem[] = targetCategories.map((c) => ({
      id: c.id,
      name: c.name,
      path: c.path,
    }));

    const warehouseLookup: WarehouseLookupItem[] = allWarehouses.map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
    }));

    return BulkTemplateGenerator.generateWorkbook({
      categories: categoryLookup,
      warehouses: warehouseLookup,
      includeSamplesIfEmpty: true,
    });
  }

  public async exportProducts(
    products: BulkParsedProduct[],
    categoryIds?: string[]
  ): Promise<Buffer> {
    const { flatList: allCategories } = await this.getCategoryHierarchy();
    const allWarehouses = await this.getWarehouseLookupList();

    let targetCategories = allCategories.filter((c) => c.isActive);
    if (categoryIds && categoryIds.length > 0) {
      const idSet = new Set(categoryIds);
      const filtered = targetCategories.filter((c) => idSet.has(c.id));
      if (filtered.length > 0) {
        targetCategories = filtered;
      }
    }

    const categoryLookup: CategoryLookupItem[] = targetCategories.map((c) => ({
      id: c.id,
      name: c.name,
      path: c.path,
    }));

    const warehouseLookup: WarehouseLookupItem[] = allWarehouses.map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
    }));

    return BulkTemplateGenerator.generateWorkbook({
      categories: categoryLookup,
      warehouses: warehouseLookup,
      products,
      includeSamplesIfEmpty: false,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  public async validateWorkbookBuffer(buffer: Buffer): Promise<BulkValidationResponse> {
    const parsed = await BulkProductParser.parseWorkbook(buffer);
    const { flatList: categoryList } = await this.getCategoryHierarchy();
    const warehouseList = await this.getWarehouseLookupList();

    return BulkProductValidator.validate({
      prisma: this.prisma,
      products: parsed.products,
      variants: parsed.variants,
      seo: parsed.seo,
      media: parsed.media,
      categoryList,
      warehouseList,
    });
  }

  public async validateParsedProducts(
    products: BulkParsedProduct[]
  ): Promise<BulkValidationResponse> {
    const { flatList: categoryList } = await this.getCategoryHierarchy();
    const warehouseList = await this.getWarehouseLookupList();

    // Convert BulkParsedProduct[] back to row format for uniform comprehensive validation
    const productRows: BulkProductRow[] = [];
    const variantRows: BulkVariantRow[] = [];
    const seoRows: BulkSeoRow[] = [];
    const mediaRows: BulkMediaRow[] = [];

    let rowNum = 2;
    for (const p of products) {
      productRows.push({
        id: p.id,
        rowNumber: p.rowNumber || rowNum,
        productGroupId: p.productGroupId,
        name: p.name,
        categoryPath: p.categoryPath,
        categoryId: p.categoryId,
        productType: p.productType,
        description: p.description,
        sku: p.sku,
        basePrice: p.basePrice,
        sellingPrice: p.sellingPrice,
        stockQuantity: p.stock?.quantity,
        warehouseCodeOrName: p.stock?.warehouseCode,
        warehouseId: p.stock?.warehouseId,
        lowStockThreshold: p.stock?.lowStockThreshold,
        metaTitle: p.metaTitle || p.seo?.metaTitle,
        metaDesc: p.metaDesc || p.seo?.metaDesc,
        weight: p.weight,
        length: p.length,
        breadth: p.breadth,
        height: p.height,
        hsnCode: p.hsnCode,
        artisanName: p.artisanName,
        artisanLocation: p.artisanLocation,
        artisanAbout: p.artisanAbout,
        allowOutOfStockOrders: p.allowOutOfStockOrders,
        hasVideoConsultation: p.hasVideoConsultation,
        videoPurchasingEnabled: p.videoPurchasingEnabled,
        videoConsultationNote: p.videoConsultationNote,
        specifications: p.specifications,
        isActive: p.isActive,
      });

      if (p.variants) {
        for (const v of p.variants) {
          variantRows.push({
            id: v.id,
            rowNumber: v.rowNumber || rowNum,
            productGroupId: p.productGroupId,
            variantSku: v.sku,
            sku: v.sku,
            title: v.title,
            size: v.size,
            color: v.color,
            fabric: v.fabric,
            attributes: v.attributes,
            basePrice: v.basePrice,
            sellingPrice: v.sellingPrice,
            price: v.price ?? v.sellingPrice,
            stockQuantity: v.stock?.quantity,
            warehouseCodeOrName: v.stock?.warehouseCode,
            warehouseId: v.stock?.warehouseId,
            lowStockThreshold: v.stock?.lowStockThreshold,
            weight: v.weight,
            length: v.length,
            breadth: v.breadth,
            height: v.height,
          });

          if (v.media) {
            v.media.forEach((vm, vmIdx) => {
              mediaRows.push({
                rowNumber: vm.rowNumber || rowNum,
                productGroupId: p.productGroupId,
                variantSku: v.sku,
                type: vm.type,
                url: vm.url,
                key: vm.key,
                thumbnailUrl: vm.thumbnailUrl,
                altText: vm.altText,
                title: vm.title,
                description: vm.description,
                mimeType: vm.mimeType,
                fileSize: vm.fileSize,
                duration: vm.duration,
                width: vm.width,
                height: vm.height,
                order: vm.order !== undefined ? vm.order : vmIdx,
                isActive: vm.isActive !== false,
              });
            });
          }
        }
      }

      if (p.metaTitle || p.metaDesc || p.seo) {
        seoRows.push({
          rowNumber: rowNum,
          productGroupId: p.productGroupId,
          metaTitle: p.metaTitle || p.seo?.metaTitle,
          metaDesc: p.metaDesc || p.seo?.metaDesc,
          slug: p.seo?.slug,
          schemaMarkup: p.seo?.schemaMarkup,
        });
      }

      const pMedia = p.media || (p.allImages ? p.allImages.filter((m) => !m.variantSku || m.source === "product") : []);
      if (pMedia && pMedia.length > 0) {
        pMedia.forEach((m, mIdx) => {
          mediaRows.push({
            rowNumber: m.rowNumber || rowNum,
            productGroupId: p.productGroupId,
            variantSku: m.variantSku,
            type: m.type,
            url: m.url,
            key: m.key,
            thumbnailUrl: m.thumbnailUrl,
            altText: m.altText,
            title: m.title,
            description: m.description,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            duration: m.duration,
            width: m.width,
            height: m.height,
            order: m.order !== undefined ? m.order : mIdx,
            isActive: m.isActive !== false,
          });
        });
      }

      rowNum++;
    }

    return BulkProductValidator.validate({
      prisma: this.prisma,
      products: productRows,
      variants: variantRows,
      seo: seoRows,
      media: mediaRows,
      categoryList,
      warehouseList,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TRANSACTIONAL IMPORT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Performs atomic per-product import with rollback per product.
   */
  public async importProducts(
    productsToImport: BulkParsedProduct[]
  ): Promise<BulkImportResponse> {
    if (!productsToImport || productsToImport.length === 0) {
      throw new ValidationError("No products provided for import.");
    }

    // 1. Re-validate everything against live DB state
    const validation = await this.validateParsedProducts(productsToImport);
    const validMap = new Map<string, BulkParsedProduct>();
    for (const p of validation.products) {
      if (p.isValid !== false) {
        validMap.set(p.productGroupId.toLowerCase().trim(), p);
      }
    }

    const results: BulkImportResponse["results"] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    for (const rawProduct of productsToImport) {
      const pKey = rawProduct.productGroupId.toLowerCase().trim();
      const validatedProduct = validMap.get(pKey);

      // If product failed validation
      if (!validatedProduct) {
        const productErrors = validation.errors.filter(
          (e) =>
            e.productGroupId?.toLowerCase().trim() === pKey && e.severity === "error"
        );
        const reason = productErrors.map((e) => e.message).join("; ") || "Failed validation";

        results.push({
          productGroupId: rawProduct.productGroupId,
          name: rawProduct.name,
          sku: rawProduct.sku,
          status: "skipped",
          error: reason,
        });
        skipped++;
        continue;
      }

      // Convert to CreateProductDTO or UpdateProductDTO matching manual product behavior
      try {
        // Product-level media (media not tied to a specific variant, sorted by order ascending)
        const productMedia = (validatedProduct.media || [])
          .filter((m) => !m.variantSku || m.source === "product")
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((m, idx) => ({
            type: m.type || MediaType.IMAGE,
            url: m.url,
            key: m.key,
            altText: m.altText,
            title: m.title,
            description: m.description,
            order: m.order !== undefined ? m.order : idx,
            thumbnailUrl: m.thumbnailUrl,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            duration: m.duration,
            width: m.width,
            height: m.height,
            isActive: m.isActive !== false,
          }));

        // Simple product stock
        const simpleStock =
          validatedProduct.productType === "simple" && validatedProduct.stock
            ? {
                warehouseId: validatedProduct.stock.warehouseId,
                quantity: validatedProduct.stock.quantity,
                lowStockThreshold: validatedProduct.stock.lowStockThreshold ?? 10,
              }
            : undefined;

        // Variable product variants
        const variantDtos =
          validatedProduct.productType === "variable" && validatedProduct.variants
            ? validatedProduct.variants.map((v) => {
                // Variant-specific media (from variant object or matched by variantSku)
                const variantMediaSources =
                  v.media && v.media.length > 0
                    ? v.media
                    : validatedProduct.media?.filter(
                        (m) => m.variantSku && m.variantSku.toLowerCase() === v.sku?.toLowerCase()
                      ) || [];

                const variantMedia = variantMediaSources
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((m, idx) => ({
                    type: m.type || MediaType.IMAGE,
                    url: m.url,
                    key: m.key,
                    altText: m.altText,
                    title: m.title,
                    description: m.description,
                    order: m.order !== undefined ? m.order : idx,
                    thumbnailUrl: m.thumbnailUrl,
                    mimeType: m.mimeType,
                    fileSize: m.fileSize,
                    duration: m.duration,
                    width: m.width,
                    height: m.height,
                    isActive: m.isActive !== false,
                  }));

                let formattedAttributes = v.attributes;
                if (Array.isArray(v.attributes)) {
                  formattedAttributes = Object.fromEntries(
                    v.attributes.map((a: any) => [a.name || a.key, a.value])
                  );
                }

                return {
                  id: v.id,
                  sku: v.sku,
                  attributes: formattedAttributes,
                  size: v.size,
                  color: v.color,
                  fabric: v.fabric,
                  basePrice: v.basePrice,
                  sellingPrice: v.sellingPrice,
                  price: v.sellingPrice ?? validatedProduct.sellingPrice,
                  weight: v.weight,
                  length: v.length,
                  breadth: v.breadth,
                  height: v.height,
                  media: variantMedia && variantMedia.length > 0 ? variantMedia : undefined,
                  stock: v.stock
                    ? {
                        warehouseId: v.stock.warehouseId,
                        quantity: v.stock.quantity,
                        lowStockThreshold: v.stock.lowStockThreshold ?? 10,
                      }
                    : undefined,
                };
              })
            : undefined;

        let productResult: any;

        if (validatedProduct.id) {
          // Follow existing manual Edit Product implementation
          const updateDto: UpdateProductDTO = {
            name: validatedProduct.name,
            description: validatedProduct.description,
            categoryId: validatedProduct.categoryId,
            basePrice: validatedProduct.basePrice,
            sellingPrice: validatedProduct.sellingPrice,
            sku: validatedProduct.sku,
            isActive: validatedProduct.isActive ?? true,
            hasVariants: validatedProduct.productType === "variable",
            hsnCode: validatedProduct.hsnCode,
            artisanName: validatedProduct.artisanName,
            artisanAbout: validatedProduct.artisanAbout,
            artisanLocation: validatedProduct.artisanLocation,
            weight: validatedProduct.weight,
            length: validatedProduct.length,
            breadth: validatedProduct.breadth,
            height: validatedProduct.height,
            allowOutOfStockOrders: validatedProduct.allowOutOfStockOrders ?? false,
            hasVideoConsultation: validatedProduct.hasVideoConsultation ?? false,
            videoPurchasingEnabled: validatedProduct.videoPurchasingEnabled ?? false,
            videoConsultationNote: validatedProduct.videoConsultationNote,
            metaTitle: validatedProduct.metaTitle ?? validatedProduct.seo?.metaTitle,
            metaDesc: validatedProduct.metaDesc ?? validatedProduct.seo?.metaDesc,
            schemaMarkup: validatedProduct.seo?.schemaMarkup,
            specifications: validatedProduct.specifications,
            media: productMedia,
            stock: simpleStock,
            variants: variantDtos,
          };

          productResult = await this.productService.updateProduct(
            String(validatedProduct.id),
            updateDto
          );
        } else {
          // Follow existing manual Create Product implementation
          const createDto: CreateProductDTO = {
            name: validatedProduct.name,
            description: validatedProduct.description,
            categoryId: validatedProduct.categoryId!,
            basePrice: validatedProduct.basePrice,
            sellingPrice: validatedProduct.sellingPrice,
            sku: validatedProduct.sku,
            isActive: validatedProduct.isActive ?? true,
            hasVariants: validatedProduct.productType === "variable",
            hsnCode: validatedProduct.hsnCode,
            artisanName: validatedProduct.artisanName,
            artisanAbout: validatedProduct.artisanAbout,
            artisanLocation: validatedProduct.artisanLocation,
            weight: validatedProduct.weight,
            length: validatedProduct.length,
            breadth: validatedProduct.breadth,
            height: validatedProduct.height,
            allowOutOfStockOrders: validatedProduct.allowOutOfStockOrders ?? false,
            hasVideoConsultation: validatedProduct.hasVideoConsultation ?? false,
            videoPurchasingEnabled: validatedProduct.videoPurchasingEnabled ?? false,
            videoConsultationNote: validatedProduct.videoConsultationNote,
            metaTitle: validatedProduct.metaTitle ?? validatedProduct.seo?.metaTitle,
            metaDesc: validatedProduct.metaDesc ?? validatedProduct.seo?.metaDesc,
            schemaMarkup: validatedProduct.seo?.schemaMarkup,
            specifications: validatedProduct.specifications,
            media: productMedia,
            stock: simpleStock,
            variants: variantDtos,
          };

          productResult = await this.productService.createProduct(createDto);
        }

        if (productResult) {
          results.push({
            productGroupId: validatedProduct.productGroupId,
            name: validatedProduct.name,
            sku: productResult.sku,
            productId: productResult.id.toString(),
            status: "success",
          });
          successful++;
        } else {
          throw new Error("Product processing returned null.");
        }
      } catch (err: any) {
        console.error(`❌ Failed to import product group "${validatedProduct.productGroupId}":`, err);
        results.push({
          productGroupId: validatedProduct.productGroupId,
          name: validatedProduct.name,
          sku: validatedProduct.sku,
          status: "failed",
          error: err.message || "Database transaction failed",
        });
        failed++;
      }
    }

    return {
      total: productsToImport.length,
      successful,
      failed,
      skipped,
      results,
    };
  }
}

