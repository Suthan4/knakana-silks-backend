import { PrismaClient } from "@/generated/prisma/client.js";
import {
  BulkProductRow,
  BulkVariantRow,
  BulkSeoRow,
  BulkMediaRow,
  BulkParsedProduct,
  BulkParsedVariant,
  BulkParsedMedia,
  BulkValidationError,
  BulkValidationResponse,
} from "./bulk-product.dto.js";
import { SlugUtil } from "@/shared/utils/index.js";

export interface CategoryCacheInfo {
  id: string;
  name: string;
  slug: string;
  path: string;
  isActive: boolean;
}

export interface WarehouseCacheInfo {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isDefaultPickup: boolean;
}

export class BulkProductValidator {
  /**
   * Validates parsed workbook rows and correlates them into structured products.
   */
  public static async validate(params: {
    prisma: PrismaClient;
    products: BulkProductRow[];
    variants: BulkVariantRow[];
    seo: BulkSeoRow[];
    media: BulkMediaRow[];
    categoryList: CategoryCacheInfo[];
    warehouseList: WarehouseCacheInfo[];
  }): Promise<BulkValidationResponse> {
    const { prisma, products, variants, seo, media, categoryList, warehouseList } = params;

    const errors: BulkValidationError[] = [];
    const productMap = new Map<string, BulkParsedProduct>();
    const seenProductGroupIds = new Set<string>();
    const seenSkusInBatch = new Map<string, { sheet: string; row?: number }>();

    // Default warehouse
    const defaultWarehouse =
      warehouseList.find((w) => w.isDefaultPickup && w.isActive) ||
      warehouseList.find((w) => w.isActive) ||
      warehouseList[0];

    // Build category lookup maps
    const categoryById = new Map<string, CategoryCacheInfo>();
    const categoryByPath = new Map<string, CategoryCacheInfo>();
    const categoryByName = new Map<string, CategoryCacheInfo[]>();
    for (const cat of categoryList) {
      categoryById.set(String(cat.id).toLowerCase().trim(), cat);
      const cleanDirect = cat.path.toLowerCase().trim();
      categoryByPath.set(cleanDirect, cat);
      // Also normalize arrows/slashes
      const normPath = cleanDirect.replace(/\s*(?:→|->|\/|\||>)\s*/g, " > ");
      categoryByPath.set(normPath, cat);

      const nameKey = cat.name.toLowerCase().trim();
      const existing = categoryByName.get(nameKey) || [];
      existing.push(cat);
      categoryByName.set(nameKey, existing);
    }

    // Build warehouse lookup maps
    const warehouseById = new Map<string, WarehouseCacheInfo>();
    const warehouseByCode = new Map<string, WarehouseCacheInfo>();
    const warehouseByName = new Map<string, WarehouseCacheInfo>();
    for (const wh of warehouseList) {
      warehouseById.set(String(wh.id).toLowerCase().trim(), wh);
      warehouseByCode.set(wh.code.toLowerCase().trim(), wh);
      warehouseByName.set(wh.name.toLowerCase().trim(), wh);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. VALIDATE PRODUCTS SHEET
    // ─────────────────────────────────────────────────────────────────────────
    for (const p of products) {
      const pErrors: BulkValidationError[] = [];

      // Product Group ID
      if (!p.productGroupId) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          field: "Product Group ID",
          message: "Product Group ID is required.",
          fix: "Enter a unique identifier like PROD-001 for this product.",
          severity: "error",
        });
      } else if (seenProductGroupIds.has(p.productGroupId.toLowerCase())) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Product Group ID",
          message: `Duplicate Product Group ID "${p.productGroupId}" in Products sheet.`,
          fix: "Ensure each row in the Products sheet has a unique Product Group ID.",
          severity: "error",
        });
      } else {
        seenProductGroupIds.add(p.productGroupId.toLowerCase());
      }

      // Name
      if (!p.name || p.name.trim().length === 0) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Product Name",
          message: "Product Name is required.",
          fix: "Enter a descriptive name for the product.",
          severity: "error",
        });
      }

      // Category Resolution (by categoryId or categoryPath)
      let resolvedCategory: CategoryCacheInfo | undefined;
      if (p.categoryId) {
        resolvedCategory = categoryById.get(String(p.categoryId).toLowerCase().trim());
      }

      if (!resolvedCategory && p.categoryPath && p.categoryPath.trim().length > 0) {
        const rawPath = p.categoryPath.toLowerCase().trim();
        const normPath = rawPath.replace(/\s*(?:→|->|\/|\||>)\s*/g, " > ");
        resolvedCategory = categoryByPath.get(normPath) || categoryByPath.get(rawPath);

        // Try matching by name if full path didn't match directly
        if (!resolvedCategory) {
          const matchingByName = categoryByName.get(rawPath);
          if (matchingByName && matchingByName.length === 1) {
            resolvedCategory = matchingByName[0];
          } else if (matchingByName && matchingByName.length > 1) {
            pErrors.push({
              sheet: "Products",
              row: p.rowNumber,
              productGroupId: p.productGroupId,
              field: "Category Full Path",
              message: `Ambiguous category "${p.categoryPath}". Multiple categories share this name.`,
              fix: `Use the full category path instead: ${matchingByName.map((c) => c.path).join(" OR ")}`,
              severity: "error",
            });
          }
        }
      }

      if (!resolvedCategory) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Category Full Path",
          message: p.categoryId
            ? `Category ID "${p.categoryId}" does not exist in the catalog.`
            : p.categoryPath
            ? `Category "${p.categoryPath}" does not exist in the catalog.`
            : "Category is required.",
          fix: "Select an existing category from the dropdown or hierarchical selector.",
          severity: "error",
        });
      } else if (!resolvedCategory.isActive) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Category Full Path",
          message: `Category "${resolvedCategory.name}" is currently inactive.`,
          fix: "Select an active category or activate this category in Category Management.",
          severity: "error",
        });
      }

      // Pricing Validation
      if (typeof p.basePrice !== "number" || isNaN(p.basePrice) || p.basePrice <= 0) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Base Price (MRP)",
          message: "Base Price must be a positive number greater than 0.",
          fix: "Enter a valid positive number for the MRP/base price.",
          severity: "error",
        });
      }

      if (typeof p.sellingPrice !== "number" || isNaN(p.sellingPrice) || p.sellingPrice <= 0) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Selling Price",
          message: "Selling Price must be a positive number greater than 0.",
          fix: "Enter a valid positive number for the selling price.",
          severity: "error",
        });
      } else if (p.basePrice > 0 && p.sellingPrice > p.basePrice) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Selling Price",
          message: `Selling Price (${p.sellingPrice}) cannot exceed Base Price (${p.basePrice}).`,
          fix: "Adjust Selling Price so it is less than or equal to Base Price (MRP).",
          severity: "error",
        });
      }

      // SKU Validation (Products)
      if (p.sku) {
        const skuTrimmed = p.sku.trim();
        const existingInBatch = seenSkusInBatch.get(skuTrimmed.toLowerCase());
        if (existingInBatch) {
          pErrors.push({
            sheet: "Products",
            row: p.rowNumber,
            productGroupId: p.productGroupId,
            field: "Parent / Base SKU",
            message: `SKU "${skuTrimmed}" is duplicated in this workbook (also on sheet "${existingInBatch.sheet}" row ${existingInBatch.row}).`,
            fix: "Ensure all product and variant SKUs in the workbook are unique.",
            severity: "error",
          });
        } else {
          seenSkusInBatch.set(skuTrimmed.toLowerCase(), { sheet: "Products", row: p.rowNumber });
        }
      }

      // Shipping Dimensions Validation
      const weight = p.weight ?? 0.5; // Default 0.5kg if missing, but check limits
      if (p.weight !== undefined && (p.weight <= 0 || p.weight > 50)) {
        pErrors.push({
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Weight in kg",
          message: "Weight must be between 0.01 kg and 50 kg.",
          fix: "Enter a realistic parcel weight in kilograms (e.g. 0.85).",
          severity: "error",
        });
      }

      for (const [dimField, dimVal] of [
        ["Length in cm", p.length],
        ["Breadth in cm", p.breadth],
        ["Height in cm", p.height],
      ] as const) {
        if (dimVal !== undefined && (dimVal <= 0 || dimVal > 200)) {
          pErrors.push({
            sheet: "Products",
            row: p.rowNumber,
            productGroupId: p.productGroupId,
            field: dimField,
            message: `${dimField} must be between 0.1 cm and 200 cm.`,
            fix: "Enter realistic parcel dimensions for shipping calculations.",
            severity: "error",
          });
        }
      }

      // Stock & Warehouse for Simple Products
      let stockInfo: BulkParsedProduct["stock"] = undefined;
      if (p.productType === "simple") {
        let wh: WarehouseCacheInfo | undefined;
        if (p.warehouseId) {
          wh = warehouseById.get(String(p.warehouseId).toLowerCase().trim());
        }
        if (!wh && p.warehouseCodeOrName) {
          const whKey = p.warehouseCodeOrName.toLowerCase().trim();
          // Extract code inside parentheses if present e.g. "WH01 (Main)"
          const codeMatch = p.warehouseCodeOrName.match(/^([A-Za-z0-9_-]+)/);
          const extractedCode = codeMatch ? codeMatch[1].toLowerCase() : whKey;

          wh = warehouseById.get(whKey) || warehouseByCode.get(extractedCode) || warehouseByName.get(whKey) || warehouseByCode.get(whKey);
          if (!wh) {
            pErrors.push({
              sheet: "Products",
              row: p.rowNumber,
              productGroupId: p.productGroupId,
              field: "Warehouse (Simple)",
              message: `Warehouse "${p.warehouseCodeOrName}" not found.`,
              fix: `Select one of the available warehouses: ${warehouseList.map((w) => w.code).join(", ")}`,
              severity: "error",
            });
          } else if (!wh.isActive) {
            pErrors.push({
              sheet: "Products",
              row: p.rowNumber,
              productGroupId: p.productGroupId,
              field: "Warehouse (Simple)",
              message: `Warehouse "${wh.name}" is inactive.`,
              fix: "Select an active warehouse.",
              severity: "error",
            });
          }
        } else if (!wh && defaultWarehouse) {
          wh = defaultWarehouse;
        } else if (!wh) {
          pErrors.push({
            sheet: "Products",
            row: p.rowNumber,
            productGroupId: p.productGroupId,
            field: "Warehouse (Simple)",
            message: "No active warehouse is configured in the system.",
            fix: "Create and activate at least one warehouse in Warehouse Management.",
            severity: "error",
          });
        }

        const qty = p.stockQuantity ?? 0;
        if (qty < 0) {
          pErrors.push({
            sheet: "Products",
            row: p.rowNumber,
            productGroupId: p.productGroupId,
            field: "Stock Quantity (Simple)",
            message: "Stock Quantity cannot be negative.",
            fix: "Enter 0 or a positive integer.",
            severity: "error",
          });
        }

        if (wh) {
          stockInfo = {
            warehouseId: wh.id,
            warehouseCode: wh.code,
            quantity: Math.floor(qty),
            lowStockThreshold: p.lowStockThreshold ? Math.floor(p.lowStockThreshold) : 10,
          };
        }
      }

      errors.push(...pErrors);

      const parsedProduct: BulkParsedProduct = {
        id: p.id,
        rowNumber: p.rowNumber,
        productGroupId: p.productGroupId,
        name: p.name,
        categoryPath: resolvedCategory ? resolvedCategory.path : p.categoryPath,
        categoryId: resolvedCategory ? resolvedCategory.id : p.categoryId,
        categoryName: resolvedCategory?.name,
        productType: p.productType,
        description: p.description || p.name,
        sku: p.sku?.trim(),
        basePrice: p.basePrice,
        sellingPrice: p.sellingPrice,
        stock: stockInfo,
        metaTitle: p.metaTitle?.trim(),
        metaDesc: p.metaDesc?.trim(),
        seo: (p.metaTitle || p.metaDesc)
          ? {
              metaTitle: p.metaTitle?.trim(),
              metaDesc: p.metaDesc?.trim(),
            }
          : undefined,
        hsnCode: p.hsnCode?.trim(),
        artisanName: p.artisanName?.trim(),
        artisanLocation: p.artisanLocation?.trim(),
        artisanAbout: p.artisanAbout?.trim(),
        weight: p.weight ?? 0.5,
        length: p.length ?? 30,
        breadth: p.breadth ?? 20,
        height: p.height ?? 5,
        allowOutOfStockOrders: p.allowOutOfStockOrders ?? false,
        hasVideoConsultation: p.hasVideoConsultation ?? false,
        videoPurchasingEnabled: p.videoPurchasingEnabled ?? false,
        videoConsultationNote: p.videoConsultationNote?.trim(),
        isActive: p.isActive ?? true,
        specifications: p.specifications,
        variants: [],
        media: [],
        allImages: [],
        errors: [...pErrors],
        isValid: pErrors.filter((e) => e.severity === "error").length === 0,
      };

      productMap.set(p.productGroupId.toLowerCase().trim(), parsedProduct);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. VALIDATE VARIANTS SHEET
    // ─────────────────────────────────────────────────────────────────────────
    const seenVariantAttributeCombos = new Map<string, number>();

    for (const v of variants) {
      const vErrors: BulkValidationError[] = [];
      const parentProduct = productMap.get(v.productGroupId.toLowerCase().trim());

      if (!parentProduct) {
        errors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Product Group ID",
          message: `Product Group ID "${v.productGroupId}" in Variants sheet does not exist in Products sheet.`,
          fix: "Ensure the Product Group ID exactly matches a row in the Products sheet.",
          severity: "error",
        });
        continue;
      }

      if (parentProduct.productType === "simple") {
        errors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Product Group ID",
          message: `Product "${parentProduct.name}" is declared as a "simple" product but has variant rows.`,
          fix: 'Either change Product Type to "variable" on Products sheet or remove variant rows for simple products.',
          severity: "error",
        });
      }

      // Variant SKU
      if (v.variantSku) {
        const vSku = v.variantSku.trim();
        const existingInBatch = seenSkusInBatch.get(vSku.toLowerCase());
        if (existingInBatch) {
          vErrors.push({
            sheet: "Variants",
            row: v.rowNumber,
            productGroupId: v.productGroupId,
            field: "Variant SKU",
            message: `Variant SKU "${vSku}" is duplicated in this workbook (also on sheet "${existingInBatch.sheet}" row ${existingInBatch.row}).`,
            fix: "Ensure each variant has a unique SKU.",
            severity: "error",
          });
        } else {
          seenSkusInBatch.set(vSku.toLowerCase(), { sheet: "Variants", row: v.rowNumber });
        }
      }

      // Duplicate Variant Attribute Combinations for same product group
      const attrs = v.attributes || {};
      let attrEntries: [string, any][] = [];
      if (Array.isArray(v.attributes)) {
        attrEntries = v.attributes.map((a: any) => [String(a.name || a.key || ""), a.value]);
      } else if (v.attributes && typeof v.attributes === "object") {
        attrEntries = Object.entries(v.attributes);
      }
      const attrKeyString = attrEntries
        .map(([k, val]) => `${String(k).toLowerCase().trim()}=${String(val ?? "").toLowerCase().trim()}`)
        .sort()
        .join("|");

      if (attrKeyString) {
        const comboKey = `${v.productGroupId.toLowerCase()}:${attrKeyString}`;
        if (seenVariantAttributeCombos.has(comboKey)) {
          vErrors.push({
            sheet: "Variants",
            row: v.rowNumber,
            productGroupId: v.productGroupId,
            field: "Variant Attributes",
            message: `Duplicate variant combination "${JSON.stringify(attrs)}" for product "${parentProduct.name}" (first defined on row ${seenVariantAttributeCombos.get(comboKey)}).`,
            fix: "Each variant combination must be unique per product. Change the size, color, or other attributes.",
            severity: "error",
          });
        } else {
          seenVariantAttributeCombos.set(comboKey, v.rowNumber);
        }
      } else {
        vErrors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Attributes",
          message: "Variant must specify at least one attribute (Size, Color, Fabric, or other attributes).",
          fix: "Fill in at least Size, Color, or Other Attributes for this variant.",
          severity: "error",
        });
      }

      // Pricing overrides
      const effectiveBasePrice = v.basePrice ?? parentProduct.basePrice;
      const effectiveSellingPrice = v.sellingPrice ?? parentProduct.sellingPrice;

      if (v.basePrice !== undefined && v.basePrice <= 0) {
        vErrors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Base Price Override",
          message: "Variant Base Price must be greater than 0.",
          fix: "Enter a positive number or leave blank to inherit parent price.",
          severity: "error",
        });
      }

      if (v.sellingPrice !== undefined && v.sellingPrice <= 0) {
        vErrors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Selling Price Override",
          message: "Variant Selling Price must be greater than 0.",
          fix: "Enter a positive number or leave blank to inherit parent price.",
          severity: "error",
        });
      }

      if (effectiveSellingPrice > effectiveBasePrice) {
        vErrors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Selling Price Override",
          message: `Variant selling price (${effectiveSellingPrice}) cannot exceed base price (${effectiveBasePrice}).`,
          fix: "Ensure variant selling price is <= base price.",
          severity: "error",
        });
      }

      // Warehouse & Stock for Variant
      let vWarehouse: WarehouseCacheInfo | undefined;
      if (v.warehouseId) {
        vWarehouse = warehouseById.get(String(v.warehouseId).toLowerCase().trim());
      }
      if (!vWarehouse && v.warehouseCodeOrName) {
        const whKey = v.warehouseCodeOrName.toLowerCase().trim();
        const codeMatch = v.warehouseCodeOrName.match(/^([A-Za-z0-9_-]+)/);
        const extractedCode = codeMatch ? codeMatch[1].toLowerCase() : whKey;
        vWarehouse = warehouseById.get(whKey) || warehouseByCode.get(extractedCode) || warehouseByName.get(whKey) || warehouseByCode.get(whKey);
        if (!vWarehouse) {
          vErrors.push({
            sheet: "Variants",
            row: v.rowNumber,
            productGroupId: v.productGroupId,
            field: "Warehouse",
            message: `Warehouse "${v.warehouseCodeOrName}" not found.`,
            fix: `Select one of: ${warehouseList.map((w) => w.code).join(", ")}`,
            severity: "error",
          });
        }
      } else if (!vWarehouse && defaultWarehouse) {
        vWarehouse = defaultWarehouse;
      } else if (!vWarehouse) {
        vErrors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Warehouse",
          message: "Warehouse is required for variant stock.",
          fix: "Specify a valid warehouse code.",
          severity: "error",
        });
      }

      const vQty = v.stockQuantity ?? 0;
      if (vQty < 0) {
        vErrors.push({
          sheet: "Variants",
          row: v.rowNumber,
          productGroupId: v.productGroupId,
          field: "Stock Quantity",
          message: "Stock Quantity cannot be negative.",
          fix: "Enter 0 or a positive integer.",
          severity: "error",
        });
      }

      errors.push(...vErrors);

      const parsedVariant: BulkParsedVariant = {
        id: v.id,
        rowNumber: v.rowNumber,
        sku: (v.sku || v.variantSku)?.trim(),
        title: v.title?.trim(),
        size: v.size?.trim(),
        color: v.color?.trim(),
        fabric: v.fabric?.trim(),
        attributes: v.attributes,
        basePrice: v.basePrice,
        sellingPrice: v.sellingPrice,
        price: v.price ?? v.sellingPrice,
        stock: vWarehouse
          ? {
              warehouseId: vWarehouse.id,
              warehouseCode: vWarehouse.code,
              quantity: Math.floor(vQty),
              lowStockThreshold: v.lowStockThreshold ? Math.floor(v.lowStockThreshold) : 10,
            }
          : undefined,
        weight: v.weight,
        length: v.length,
        breadth: v.breadth,
        height: v.height,
        media: [],
        errors: vErrors.map((e) => e.message),
      };

      if (!parentProduct.variants) parentProduct.variants = [];
      parentProduct.variants.push(parsedVariant);

      if (vErrors.length > 0) {
        if (!parentProduct.errors) parentProduct.errors = [];
        parentProduct.errors.push(...vErrors);
        parentProduct.isValid = false;
      }
    }

    // Check for variable products that have 0 variants
    for (const p of productMap.values()) {
      if (p.productType === "variable" && (!p.variants || p.variants.length === 0)) {
        const err: BulkValidationError = {
          sheet: "Products",
          row: p.rowNumber,
          productGroupId: p.productGroupId,
          field: "Product Type",
          message: `Variable product "${p.name}" has no variants listed in the Variants sheet.`,
          fix: "Add at least one variant row for this Product Group ID in the Variants sheet.",
          severity: "error",
        };
        errors.push(err);
        if (!p.errors) p.errors = [];
        p.errors.push(err);
        p.isValid = false;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. VALIDATE SEO SHEET
    // ─────────────────────────────────────────────────────────────────────────
    for (const s of seo) {
      const sErrors: BulkValidationError[] = [];
      const parentProduct = productMap.get(s.productGroupId.toLowerCase().trim());

      if (!parentProduct) {
        errors.push({
          sheet: "SEO",
          row: s.rowNumber,
          productGroupId: s.productGroupId,
          field: "Product Group ID",
          message: `Product Group ID "${s.productGroupId}" in SEO sheet does not exist in Products sheet.`,
          fix: "Ensure the Product Group ID matches an existing product in the Products sheet.",
          severity: "error",
        });
        continue;
      }

      if (s.metaTitle && s.metaTitle.length > 70) {
        sErrors.push({
          sheet: "SEO",
          row: s.rowNumber,
          productGroupId: s.productGroupId,
          field: "SEO Meta Title",
          message: `Meta title is ${s.metaTitle.length} characters (recommended: <= 70 chars for Google search results).`,
          fix: "Shorten meta title to keep it concise.",
          severity: "warning",
        });
      }

      if (s.metaDesc && s.metaDesc.length > 320) {
        sErrors.push({
          sheet: "SEO",
          row: s.rowNumber,
          productGroupId: s.productGroupId,
          field: "Meta Description",
          message: `Meta description is ${s.metaDesc.length} characters (recommended: <= 160-320 chars).`,
          fix: "Shorten meta description to improve search snippet visibility.",
          severity: "warning",
        });
      }

      if (s.slug) {
        const cleanSlug = SlugUtil.generateSlug(s.slug);
        if (!cleanSlug) {
          sErrors.push({
            sheet: "SEO",
            row: s.rowNumber,
            productGroupId: s.productGroupId,
            field: "Custom URL Slug",
            message: `Invalid slug "${s.slug}". Slugs must contain only letters, numbers, and hyphens.`,
            fix: "Enter a valid URL-friendly slug or leave blank to auto-generate.",
            severity: "error",
          });
        }
      }

      errors.push(...sErrors);

      parentProduct.seo = {
        metaTitle: s.metaTitle?.trim(),
        metaDesc: s.metaDesc?.trim(),
        slug: s.slug ? SlugUtil.generateSlug(s.slug) : undefined,
        schemaMarkup: s.schemaMarkup?.trim(),
      };
      if (s.metaTitle) parentProduct.metaTitle = s.metaTitle.trim();
      if (s.metaDesc) parentProduct.metaDesc = s.metaDesc.trim();

      if (sErrors.some((e) => e.severity === "error")) {
        parentProduct.isValid = false;
        if (!parentProduct.errors) parentProduct.errors = [];
        parentProduct.errors.push(...sErrors);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. VALIDATE MEDIA SHEET
    // ─────────────────────────────────────────────────────────────────────────
    for (const m of media) {
      const mErrors: BulkValidationError[] = [];
      const parentProduct = productMap.get(m.productGroupId.toLowerCase().trim());

      if (!parentProduct) {
        errors.push({
          sheet: "Media",
          row: m.rowNumber,
          productGroupId: m.productGroupId,
          field: "Product Group ID",
          message: `Product Group ID "${m.productGroupId}" in Media sheet does not exist in Products sheet.`,
          fix: "Ensure the Product Group ID matches an existing product in the Products sheet.",
          severity: "error",
        });
        continue;
      }

      if (!m.url || m.url.trim().length === 0) {
        mErrors.push({
          sheet: "Media",
          row: m.rowNumber,
          productGroupId: m.productGroupId,
          field: "Media URL",
          message: `Media URL or file reference is required.`,
          fix: "Provide a valid accessible HTTPS URL or Google Drive file reference.",
          severity: "error",
        });
      } else if (m.url.startsWith("http://") || m.url.startsWith("https://")) {
        try {
          new URL(m.url);
        } catch {
          mErrors.push({
            sheet: "Media",
            row: m.rowNumber,
            productGroupId: m.productGroupId,
            field: "Media URL",
            message: `Invalid media URL: "${m.url}".`,
            fix: "Provide a valid accessible HTTPS URL.",
            severity: "error",
          });
        }
      }

      let matchingVariant: BulkParsedVariant | undefined;
      if (m.variantSku) {
        matchingVariant = parentProduct.variants?.find(
          (v) => v.sku?.toLowerCase() === m.variantSku?.toLowerCase()
        );
        if (!matchingVariant) {
          mErrors.push({
            sheet: "Media",
            row: m.rowNumber,
            productGroupId: m.productGroupId,
            field: "Variant SKU",
            message: `Variant SKU "${m.variantSku}" does not match any variant under product "${parentProduct.name}".`,
            fix: "Ensure Variant SKU matches a row in the Variants sheet for this product group.",
            severity: "warning",
          });
        }
      }

      errors.push(...mErrors);

      const parsedMedia: BulkParsedMedia = {
        rowNumber: m.rowNumber,
        type: m.type,
        url: m.url.trim(),
        key: m.key?.trim(),
        thumbnailUrl: m.thumbnailUrl?.trim(),
        altText: m.altText?.trim() || (matchingVariant ? `${parentProduct.name} - ${matchingVariant.sku || 'Variant'}` : parentProduct.name),
        title: m.title?.trim(),
        description: m.description?.trim(),
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        duration: m.duration,
        width: m.width,
        height: m.height,
        order: m.order ?? 0,
        isActive: m.isActive !== false,
        variantSku: m.variantSku?.trim(),
        productGroupId: parentProduct.productGroupId,
        source: m.variantSku ? "variant" : "product",
      };

      if (matchingVariant) {
        if (!matchingVariant.media) matchingVariant.media = [];
        matchingVariant.media.push(parsedMedia);
      } else {
        if (!parentProduct.media) parentProduct.media = [];
        parentProduct.media.push(parsedMedia);
      }

      if (mErrors.some((e) => e.severity === "error")) {
        parentProduct.isValid = false;
        if (!parentProduct.errors) parentProduct.errors = [];
        parentProduct.errors.push(...mErrors);
      }
    }

    // Assemble allImages and sort media for each product
    for (const p of productMap.values()) {
      if (p.media) {
        p.media.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      } else {
        p.media = [];
      }

      const variantMediaList: BulkParsedMedia[] = [];
      if (p.variants) {
        for (const v of p.variants) {
          if (v.media) {
            v.media.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            variantMediaList.push(...v.media);
          } else {
            v.media = [];
          }
        }
      }

      // Display all available product images together in a single preview
      p.allImages = [...p.media, ...variantMediaList].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. DATABASE CONFLICT CHECKS (SKUs and Slugs)
    // ─────────────────────────────────────────────────────────────────────────
    const allSkusToCheck: string[] = [];
    const allSlugsToCheck: string[] = [];

    for (const p of productMap.values()) {
      if (p.sku) allSkusToCheck.push(p.sku);
      if (p.variants) {
        for (const v of p.variants) {
          if (v.sku) allSkusToCheck.push(v.sku);
        }
      }
      const slug = p.seo?.slug || SlugUtil.generateSlug(p.name);
      if (slug) allSlugsToCheck.push(slug);
    }

    if (allSkusToCheck.length > 0) {
      const [existingProductsWithSku, existingVariantsWithSku] = await Promise.all([
        prisma.product.findMany({
          where: { sku: { in: allSkusToCheck } },
          select: { id: true, sku: true, name: true },
        }),
        prisma.productVariant.findMany({
          where: { sku: { in: allSkusToCheck } },
          select: { id: true, sku: true, product: { select: { name: true } } },
        }),
      ]);

      const conflictSkuMap = new Map<string, string>();
      for (const ep of existingProductsWithSku) {
        conflictSkuMap.set(ep.sku.toLowerCase(), `Product "${ep.name}"`);
      }
      for (const ev of existingVariantsWithSku) {
        conflictSkuMap.set(ev.sku.toLowerCase(), `Variant of "${ev.product.name}"`);
      }

      for (const p of productMap.values()) {
        if (p.sku && conflictSkuMap.has(p.sku.toLowerCase())) {
          // If editing an existing product and the SKU matches this product, allow it
          const existingProduct = existingProductsWithSku.find(
            (ep) => ep.sku.toLowerCase() === p.sku!.toLowerCase()
          );
          if (p.id && existingProduct && existingProduct.id.toString() === String(p.id)) {
            // Self match - valid update
          } else {
            const err: BulkValidationError = {
              sheet: "Products",
              row: p.rowNumber,
              productGroupId: p.productGroupId,
              field: "Parent / Base SKU",
              message: `SKU "${p.sku}" already exists in database (${conflictSkuMap.get(p.sku.toLowerCase())}).`,
              fix: "Change this SKU to a unique value or leave blank to auto-generate.",
              severity: "error",
            };
            errors.push(err);
            if (!p.errors) p.errors = [];
            p.errors.push(err);
            p.isValid = false;
          }
        }

        if (p.variants) {
          for (const v of p.variants) {
            if (v.sku && conflictSkuMap.has(v.sku.toLowerCase())) {
              const existingVar = existingVariantsWithSku.find(
                (ev) => ev.sku.toLowerCase() === v.sku!.toLowerCase()
              );
              if (
                (p.id && existingVar && (existingVar as any).productId?.toString() === String(p.id)) ||
                (v.id && existingVar && existingVar.id.toString() === String(v.id))
              ) {
                // Self match - valid update
              } else {
                const err: BulkValidationError = {
                  sheet: "Variants",
                  row: v.rowNumber,
                  productGroupId: p.productGroupId,
                  field: "Variant SKU",
                  message: `Variant SKU "${v.sku}" already exists in database (${conflictSkuMap.get(v.sku.toLowerCase())}).`,
                  fix: "Change this variant SKU or leave blank to auto-generate.",
                  severity: "error",
                };
                errors.push(err);
                if (!p.errors) p.errors = [];
                p.errors.push(err);
                p.isValid = false;
              }
            }
          }
        }
      }
    }

    // Summary calculation
    const parsedProductsList = Array.from(productMap.values());
    const validCount = parsedProductsList.filter((p) => p.isValid !== false).length;
    const invalidCount = parsedProductsList.length - validCount;
    const errorCount = errors.filter((e) => e.severity === "error").length;
    const warningCount = errors.filter((e) => e.severity === "warning").length;

    let totalVariants = 0;
    let totalMedia = 0;
    let simpleProducts = 0;
    let variableProducts = 0;

    for (const p of parsedProductsList) {
      if (p.productType === "variable") {
        variableProducts++;
        totalVariants += p.variants?.length || 0;
      } else {
        simpleProducts++;
      }
      totalMedia += p.allImages?.length || (p.media?.length || 0);
    }

    return {
      valid: errorCount === 0 && parsedProductsList.length > 0,
      summary: {
        totalProducts: parsedProductsList.length,
        simpleProducts,
        variableProducts,
        totalVariants,
        totalMedia,
        validProducts: validCount,
        invalidProducts: invalidCount,
        errorCount,
        warningCount,
      },
      errors,
      products: parsedProductsList,
    };
  }
}
