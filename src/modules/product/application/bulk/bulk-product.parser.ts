import ExcelJS from "exceljs";
import {
  BulkProductRow,
  BulkVariantRow,
  BulkSeoRow,
  BulkMediaRow,
} from "./bulk-product.dto.js";
import { MediaType } from "@/generated/prisma/enums.js";

export interface ParsedWorkbookData {
  products: BulkProductRow[];
  variants: BulkVariantRow[];
  seo: BulkSeoRow[];
  media: BulkMediaRow[];
}

export class BulkProductParser {
  /**
   * Parses an Excel buffer into typed row collections for all sheets.
   */
  public static async parseWorkbook(buffer: Buffer): Promise<ParsedWorkbookData> {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS accepts Uint8Array or ArrayBuffer or Buffer
    await workbook.xlsx.load(buffer as any);

    const productsSheet = this.findSheet(workbook, ["products", "product"]);
    const variantsSheet = this.findSheet(workbook, ["variants", "variant"]);
    const seoSheet = this.findSheet(workbook, ["seo", "metadata"]);
    const mediaSheet = this.findSheet(workbook, ["media", "images", "image"]);

    const products = productsSheet ? this.parseProductsSheet(productsSheet) : [];
    const variants = variantsSheet ? this.parseVariantsSheet(variantsSheet) : [];
    const seo = seoSheet ? this.parseSeoSheet(seoSheet) : [];
    const media = mediaSheet ? this.parseMediaSheet(mediaSheet) : [];

    return { products, variants, seo, media };
  }

  private static findSheet(
    workbook: ExcelJS.Workbook,
    candidates: string[]
  ): ExcelJS.Worksheet | undefined {
    for (const candidate of candidates) {
      const match = workbook.worksheets.find(
        (ws) => ws.name.trim().toLowerCase() === candidate.toLowerCase()
      );
      if (match) return match;
    }
    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CELL VALUE EXTRACTORS
  // ─────────────────────────────────────────────────────────────────────────────
  public static getCellString(cell: ExcelJS.Cell): string {
    const val = cell.value;
    if (val === null || val === undefined) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "number" || typeof val === "boolean") return String(val).trim();
    if (typeof val === "object") {
      // Rich text
      if ("richText" in val && Array.isArray((val as any).richText)) {
        return (val as any).richText.map((t: any) => t.text || "").join("").trim();
      }
      // Hyperlink
      if ("text" in val) return String((val as any).text).trim();
      // Formula result
      if ("result" in val && val.result !== undefined && val.result !== null) {
        return String(val.result).trim();
      }
    }
    return String(val).trim();
  }

  public static getCellNumber(cell: ExcelJS.Cell): number | undefined {
    const str = this.getCellString(cell).replace(/,/g, "");
    if (!str) return undefined;
    const num = parseFloat(str);
    return isNaN(num) ? undefined : num;
  }

  public static getCellBoolean(cell: ExcelJS.Cell, defaultValue = false): boolean {
    const str = this.getCellString(cell).toLowerCase();
    if (!str) return defaultValue;
    if (["yes", "true", "1", "y", "active", "enabled"].includes(str)) return true;
    if (["no", "false", "0", "n", "inactive", "disabled"].includes(str)) return false;
    return defaultValue;
  }

  private static buildHeaderMap(row: ExcelJS.Row): Map<string, number> {
    const map = new Map<string, number>();
    row.eachCell((cell, colNumber) => {
      const text = this.getCellString(cell).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (text) {
        map.set(text, colNumber);
      }
    });
    return map;
  }

  private static findCol(map: Map<string, number>, keys: string[]): number | undefined {
    for (const key of keys) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (map.has(normalized)) return map.get(normalized);
      // Partial match
      for (const [mapKey, col] of map.entries()) {
        if (mapKey.includes(normalized) || normalized.includes(mapKey)) {
          return col;
        }
      }
    }
    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PARSE PRODUCTS SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static parseProductsSheet(sheet: ExcelJS.Worksheet): BulkProductRow[] {
    const rows: BulkProductRow[] = [];
    if (sheet.rowCount < 2) return rows;

    const headerMap = this.buildHeaderMap(sheet.getRow(1));

    const colGroupId = this.findCol(headerMap, ["productgroupid", "groupid"]);
    const colName = this.findCol(headerMap, ["productname", "name", "title"]);
    const colCategory = this.findCol(headerMap, ["categoryfullpath", "categorypath", "category"]);
    const colType = this.findCol(headerMap, ["producttype", "type"]);
    const colDesc = this.findCol(headerMap, ["description", "desc"]);
    const colSku = this.findCol(headerMap, ["parentbasesku", "basesku", "parentsku", "sku"]);
    const colBasePrice = this.findCol(headerMap, ["basepricemrp", "baseprice", "mrp", "actualprice"]);
    const colSellingPrice = this.findCol(headerMap, ["sellingprice", "saleprice", "price"]);
    const colStock = this.findCol(headerMap, ["stockquantitysimple", "stockquantity", "stock", "quantity"]);
    const colWarehouse = this.findCol(headerMap, ["warehousesimple", "warehouse", "warehousecode"]);
    const colThreshold = this.findCol(headerMap, ["lowstockalert", "lowstockthreshold", "threshold"]);
    const colWeight = this.findCol(headerMap, ["weightinkg", "weight"]);
    const colLength = this.findCol(headerMap, ["lengthincm", "length"]);
    const colBreadth = this.findCol(headerMap, ["breadthincm", "breadth", "width"]);
    const colHeight = this.findCol(headerMap, ["heightincm", "height"]);
    const colHsn = this.findCol(headerMap, ["hsncode", "hsn"]);
    const colArtisan = this.findCol(headerMap, ["artisanname", "artisan"]);
    const colArtisanLoc = this.findCol(headerMap, ["artisanlocation"]);
    const colArtisanAbout = this.findCol(headerMap, ["artisanabout"]);
    const colBackorders = this.findCol(headerMap, ["allowbackorders", "allowoutofstockorders"]);
    const colVideoConsult = this.findCol(headerMap, ["videoconsultation", "hasvideoconsultation"]);
    const colVideoPurchase = this.findCol(headerMap, ["videopurchasing", "videopurchasingenabled"]);
    const colVideoNote = this.findCol(headerMap, ["videonote", "videoconsultationnote"]);
    const colActive = this.findCol(headerMap, ["activestate", "isactive", "active", "status"]);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const productGroupId = colGroupId ? this.getCellString(row.getCell(colGroupId)) : "";
      const name = colName ? this.getCellString(row.getCell(colName)) : "";

      // Skip empty rows
      if (!productGroupId && !name) return;

      const rawType = colType ? this.getCellString(row.getCell(colType)).toLowerCase() : "simple";
      const productType: "simple" | "variable" = rawType.includes("var") ? "variable" : "simple";

      const basePrice = colBasePrice ? this.getCellNumber(row.getCell(colBasePrice)) ?? 0 : 0;
      const sellingPrice = colSellingPrice ? this.getCellNumber(row.getCell(colSellingPrice)) ?? basePrice : basePrice;

      rows.push({
        rowNumber,
        productGroupId,
        name,
        categoryPath: colCategory ? this.getCellString(row.getCell(colCategory)) : "",
        productType,
        description: colDesc ? this.getCellString(row.getCell(colDesc)) : "",
        sku: colSku ? this.getCellString(row.getCell(colSku)) : undefined,
        basePrice,
        sellingPrice,
        stockQuantity: colStock ? this.getCellNumber(row.getCell(colStock)) : undefined,
        warehouseCodeOrName: colWarehouse ? this.getCellString(row.getCell(colWarehouse)) : undefined,
        lowStockThreshold: colThreshold ? this.getCellNumber(row.getCell(colThreshold)) : 10,
        weight: colWeight ? this.getCellNumber(row.getCell(colWeight)) : undefined,
        length: colLength ? this.getCellNumber(row.getCell(colLength)) : undefined,
        breadth: colBreadth ? this.getCellNumber(row.getCell(colBreadth)) : undefined,
        height: colHeight ? this.getCellNumber(row.getCell(colHeight)) : undefined,
        hsnCode: colHsn ? this.getCellString(row.getCell(colHsn)) : undefined,
        artisanName: colArtisan ? this.getCellString(row.getCell(colArtisan)) : undefined,
        artisanLocation: colArtisanLoc ? this.getCellString(row.getCell(colArtisanLoc)) : undefined,
        artisanAbout: colArtisanAbout ? this.getCellString(row.getCell(colArtisanAbout)) : undefined,
        allowOutOfStockOrders: colBackorders ? this.getCellBoolean(row.getCell(colBackorders), false) : false,
        hasVideoConsultation: colVideoConsult ? this.getCellBoolean(row.getCell(colVideoConsult), false) : false,
        videoPurchasingEnabled: colVideoPurchase ? this.getCellBoolean(row.getCell(colVideoPurchase), false) : false,
        videoConsultationNote: colVideoNote ? this.getCellString(row.getCell(colVideoNote)) : undefined,
        isActive: colActive ? this.getCellBoolean(row.getCell(colActive), true) : true,
      });
    });

    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PARSE VARIANTS SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static parseVariantsSheet(sheet: ExcelJS.Worksheet): BulkVariantRow[] {
    const rows: BulkVariantRow[] = [];
    if (sheet.rowCount < 2) return rows;

    const headerMap = this.buildHeaderMap(sheet.getRow(1));

    const colGroupId = this.findCol(headerMap, ["productgroupid", "groupid"]);
    const colVariantSku = this.findCol(headerMap, ["variantsku", "sku"]);
    const colSize = this.findCol(headerMap, ["size"]);
    const colColor = this.findCol(headerMap, ["color"]);
    const colFabric = this.findCol(headerMap, ["fabric"]);
    const colAttributes = this.findCol(headerMap, ["otherattributes", "attributes", "dynamicattributes"]);
    const colBasePrice = this.findCol(headerMap, ["basepriceoverride", "baseprice"]);
    const colSellingPrice = this.findCol(headerMap, ["sellingpriceoverride", "sellingprice", "price"]);
    const colStock = this.findCol(headerMap, ["stockquantity", "stock", "quantity"]);
    const colWarehouse = this.findCol(headerMap, ["warehouse", "warehousecode"]);
    const colThreshold = this.findCol(headerMap, ["lowstockalert", "lowstockthreshold"]);
    const colWeight = this.findCol(headerMap, ["weightinkgoverride", "weight"]);
    const colLength = this.findCol(headerMap, ["lengthincmoverride", "length"]);
    const colBreadth = this.findCol(headerMap, ["breadthincmoverride", "breadth", "width"]);
    const colHeight = this.findCol(headerMap, ["heightincmoverride", "height"]);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const productGroupId = colGroupId ? this.getCellString(row.getCell(colGroupId)) : "";
      const variantSku = colVariantSku ? this.getCellString(row.getCell(colVariantSku)) : "";
      const size = colSize ? this.getCellString(row.getCell(colSize)) : "";
      const color = colColor ? this.getCellString(row.getCell(colColor)) : "";
      const fabric = colFabric ? this.getCellString(row.getCell(colFabric)) : "";

      if (!productGroupId && !variantSku && !size && !color) return;

      const rawAttributes = colAttributes ? this.getCellString(row.getCell(colAttributes)) : "";
      const attributes = this.parseDynamicAttributes(rawAttributes, size, color, fabric);

      rows.push({
        rowNumber,
        productGroupId,
        variantSku: variantSku || undefined,
        size: size || undefined,
        color: color || undefined,
        fabric: fabric || undefined,
        attributes,
        basePrice: colBasePrice ? this.getCellNumber(row.getCell(colBasePrice)) : undefined,
        sellingPrice: colSellingPrice ? this.getCellNumber(row.getCell(colSellingPrice)) : undefined,
        stockQuantity: colStock ? this.getCellNumber(row.getCell(colStock)) : 0,
        warehouseCodeOrName: colWarehouse ? this.getCellString(row.getCell(colWarehouse)) : undefined,
        lowStockThreshold: colThreshold ? this.getCellNumber(row.getCell(colThreshold)) : 10,
        weight: colWeight ? this.getCellNumber(row.getCell(colWeight)) : undefined,
        length: colLength ? this.getCellNumber(row.getCell(colLength)) : undefined,
        breadth: colBreadth ? this.getCellNumber(row.getCell(colBreadth)) : undefined,
        height: colHeight ? this.getCellNumber(row.getCell(colHeight)) : undefined,
      });
    });

    return rows;
  }

  private static parseDynamicAttributes(
    rawText: string,
    size?: string,
    color?: string,
    fabric?: string
  ): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (size) attrs.Size = size;
    if (color) attrs.Color = color;
    if (fabric) attrs.Fabric = fabric;

    if (!rawText) return attrs;

    // Check if JSON
    if (rawText.startsWith("{") && rawText.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawText);
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== undefined && v !== null) {
            attrs[k.trim()] = String(v).trim();
          }
        }
        return attrs;
      } catch {
        // Fall back to key:value parsing
      }
    }

    // Split by comma or semicolon
    const pairs = rawText.split(/[,;]/);
    for (const pair of pairs) {
      const sepIndex = pair.indexOf(":") !== -1 ? pair.indexOf(":") : pair.indexOf("=");
      if (sepIndex !== -1) {
        const key = pair.substring(0, sepIndex).trim();
        const value = pair.substring(sepIndex + 1).trim();
        if (key && value) {
          attrs[key] = value;
        }
      }
    }

    return attrs;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PARSE SEO SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static parseSeoSheet(sheet: ExcelJS.Worksheet): BulkSeoRow[] {
    const rows: BulkSeoRow[] = [];
    if (sheet.rowCount < 2) return rows;

    const headerMap = this.buildHeaderMap(sheet.getRow(1));

    const colGroupId = this.findCol(headerMap, ["productgroupid", "groupid"]);
    const colMetaTitle = this.findCol(headerMap, ["seometatitle", "metatitle", "title"]);
    const colMetaDesc = this.findCol(headerMap, ["metadescription", "metadesc", "description"]);
    const colSlug = this.findCol(headerMap, ["customurlslug", "urlslug", "slug"]);
    const colSchema = this.findCol(headerMap, ["schemamarkup", "schema"]);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const productGroupId = colGroupId ? this.getCellString(row.getCell(colGroupId)) : "";
      if (!productGroupId) return;

      rows.push({
        rowNumber,
        productGroupId,
        metaTitle: colMetaTitle ? this.getCellString(row.getCell(colMetaTitle)) : undefined,
        metaDesc: colMetaDesc ? this.getCellString(row.getCell(colMetaDesc)) : undefined,
        slug: colSlug ? this.getCellString(row.getCell(colSlug)) : undefined,
        schemaMarkup: colSchema ? this.getCellString(row.getCell(colSchema)) : undefined,
      });
    });

    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PARSE MEDIA SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static parseMediaSheet(sheet: ExcelJS.Worksheet): BulkMediaRow[] {
    const rows: BulkMediaRow[] = [];
    if (sheet.rowCount < 2) return rows;

    const headerMap = this.buildHeaderMap(sheet.getRow(1));

    const colGroupId = this.findCol(headerMap, ["productgroupid", "groupid"]);
    const colVariantSku = this.findCol(headerMap, ["variantsku", "sku"]);
    const colType = this.findCol(headerMap, ["mediatype", "type"]);
    const colUrl = this.findCol(headerMap, ["mediaurl", "url", "imageurl"]);
    const colAltText = this.findCol(headerMap, ["alttext", "alt"]);
    const colTitle = this.findCol(headerMap, ["title"]);
    const colDesc = this.findCol(headerMap, ["description", "desc"]);
    const colOrder = this.findCol(headerMap, ["displayorder", "order"]);
    const colThumb = this.findCol(headerMap, ["thumbnailurl", "thumbnail"]);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const productGroupId = colGroupId ? this.getCellString(row.getCell(colGroupId)) : "";
      const url = colUrl ? this.getCellString(row.getCell(colUrl)) : "";
      if (!productGroupId && !url) return;

      const rawType = colType ? this.getCellString(row.getCell(colType)).toUpperCase() : "IMAGE";
      const type: MediaType = rawType === "VIDEO" ? MediaType.VIDEO : MediaType.IMAGE;

      rows.push({
        rowNumber,
        productGroupId,
        variantSku: colVariantSku ? this.getCellString(row.getCell(colVariantSku)) : undefined,
        type,
        url,
        altText: colAltText ? this.getCellString(row.getCell(colAltText)) : undefined,
        title: colTitle ? this.getCellString(row.getCell(colTitle)) : undefined,
        description: colDesc ? this.getCellString(row.getCell(colDesc)) : undefined,
        order: colOrder ? this.getCellNumber(row.getCell(colOrder)) ?? 0 : 0,
        thumbnailUrl: colThumb ? this.getCellString(row.getCell(colThumb)) : undefined,
        isActive: true,
      });
    });

    return rows;
  }

  /**
   * Parses raw text (JSON, CSV, or TSV) into typed row collections.
   */
  public static parseRawText(rawText: string): ParsedWorkbookData {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return { products: [], variants: [], seo: [], media: [] };
    }

    // 1. JSON parsing
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        const rawItems: any[] = Array.isArray(parsed)
          ? parsed
          : parsed && Array.isArray(parsed.products)
          ? parsed.products
          : (parsed && typeof parsed === "object" && (parsed.name || parsed.productGroupId || parsed.sku) ? [parsed] : []);

        if (rawItems.length > 0) {
          const products: BulkProductRow[] = [];
          const variants: BulkVariantRow[] = [];
          const seo: BulkSeoRow[] = [];
          const media: BulkMediaRow[] = [];

          rawItems.forEach((item: any, idx: number) => {
            const rowNumber = idx + 2;
            const groupId = String(item.productGroupId || item.groupId || item.id || `PROD-${idx + 1}`);
            const metaTitle = item.metaTitle || item.meta_title || item.seo?.metaTitle || undefined;
            const metaDesc = item.metaDesc || item.meta_desc || item.metaDescription || item.seo?.metaDesc || undefined;

            products.push({
              id: item.id ? String(item.id) : (item.productId ? String(item.productId) : undefined),
              rowNumber,
              productGroupId: groupId,
              productType: item.productType || (item.variants?.length ? "variable" : "simple"),
              name: item.name || "Untitled Product",
              categoryPath: item.categoryPath || item.category || "",
              categoryId: item.categoryId ? String(item.categoryId) : undefined,
              description: item.description || "",
              basePrice: Number(item.basePrice || item.price || 0),
              sellingPrice: Number(item.sellingPrice || item.basePrice || item.price || 0),
              sku: item.sku || undefined,
              warehouseCodeOrName: item.warehouseCode || item.warehouseCodeOrName || item.stock?.warehouseCode || undefined,
              warehouseId: item.warehouseId || item.stock?.warehouseId || undefined,
              stockQuantity: item.stockQuantity !== undefined ? Number(item.stockQuantity) : (item.stock?.quantity ?? 0),
              lowStockThreshold: item.lowStockThreshold ?? item.stock?.lowStockThreshold ?? 10,
              metaTitle,
              metaDesc,
              hsnCode: item.hsnCode,
              artisanName: item.artisanName,
              artisanAbout: item.artisanAbout,
              artisanLocation: item.artisanLocation,
              weight: item.weight !== undefined ? Number(item.weight) : 0.5,
              length: item.length !== undefined ? Number(item.length) : 10,
              breadth: item.breadth !== undefined ? Number(item.breadth) : 10,
              height: item.height !== undefined ? Number(item.height) : 5,
              allowOutOfStockOrders: Boolean(item.allowOutOfStockOrders),
              hasVideoConsultation: Boolean(item.hasVideoConsultation),
              videoPurchasingEnabled: Boolean(item.videoPurchasingEnabled),
              videoConsultationNote: item.videoConsultationNote,
              specifications: Array.isArray(item.specifications) ? item.specifications : undefined,
              isActive: item.isActive !== false,
            });

            if (item.variants && Array.isArray(item.variants)) {
              item.variants.forEach((v: any, vIdx: number) => {
                const variantSku = v.sku || v.variantSku || `${groupId}-VAR-${vIdx + 1}`;
                const variantMediaRows: BulkMediaRow[] = [];
                const vMedia = v.media || v.images;

                if (vMedia && Array.isArray(vMedia)) {
                  vMedia.forEach((vm: any, vmIdx: number) => {
                    const row: BulkMediaRow = {
                      rowNumber: vmIdx + 2,
                      productGroupId: groupId,
                      variantSku,
                      url: typeof vm === "string" ? vm : (vm.url || vm.imageUrl || vm.image || ""),
                      key: typeof vm === "object" ? vm.key : undefined,
                      type: (typeof vm === "object" && vm.type === "VIDEO") ? MediaType.VIDEO : MediaType.IMAGE,
                      altText: typeof vm === "object" ? vm.altText : undefined,
                      title: typeof vm === "object" ? vm.title : undefined,
                      description: typeof vm === "object" ? vm.description : undefined,
                      thumbnailUrl: typeof vm === "object" ? vm.thumbnailUrl : undefined,
                      mimeType: typeof vm === "object" ? vm.mimeType : undefined,
                      fileSize: typeof vm === "object" && vm.fileSize !== undefined ? Number(vm.fileSize) : undefined,
                      duration: typeof vm === "object" && vm.duration !== undefined ? Number(vm.duration) : undefined,
                      width: typeof vm === "object" && vm.width !== undefined ? Number(vm.width) : undefined,
                      height: typeof vm === "object" && vm.height !== undefined ? Number(vm.height) : undefined,
                      order: typeof vm === "object" && vm.order !== undefined ? Number(vm.order) : vmIdx,
                      isActive: typeof vm === "object" ? vm.isActive !== false : true,
                    };
                    media.push(row);
                    variantMediaRows.push(row);
                  });
                }

                variants.push({
                  id: v.id ? String(v.id) : undefined,
                  rowNumber: vIdx + 2,
                  productGroupId: groupId,
                  variantSku,
                  sku: variantSku,
                  title: v.title,
                  size: v.size,
                  color: v.color,
                  fabric: v.fabric,
                  attributes: v.attributes || {},
                  basePrice: v.basePrice !== undefined ? Number(v.basePrice) : undefined,
                  sellingPrice: v.sellingPrice !== undefined ? Number(v.sellingPrice) : (v.price !== undefined ? Number(v.price) : undefined),
                  price: v.price !== undefined ? Number(v.price) : (v.sellingPrice !== undefined ? Number(v.sellingPrice) : undefined),
                  warehouseCodeOrName: v.warehouseCode || v.warehouseCodeOrName || v.stock?.warehouseCode || undefined,
                  warehouseId: v.warehouseId || v.stock?.warehouseId || undefined,
                  stockQuantity: v.stockQuantity !== undefined ? Number(v.stockQuantity) : (v.stock?.quantity ?? 0),
                  lowStockThreshold: v.lowStockThreshold ?? v.stock?.lowStockThreshold ?? 10,
                  weight: v.weight !== undefined ? Number(v.weight) : undefined,
                  length: v.length !== undefined ? Number(v.length) : undefined,
                  breadth: v.breadth !== undefined ? Number(v.breadth) : undefined,
                  height: v.height !== undefined ? Number(v.height) : undefined,
                  media: variantMediaRows.length > 0 ? variantMediaRows : undefined,
                });
              });
            }

            const itemMedia = item.media || item.images;
            if (itemMedia && Array.isArray(itemMedia)) {
              itemMedia.forEach((m: any, mIdx: number) => {
                media.push({
                  rowNumber: mIdx + 2,
                  productGroupId: groupId,
                  variantSku: m.variantSku,
                  url: typeof m === "string" ? m : (m.url || m.imageUrl || m.image || ""),
                  key: typeof m === "object" ? m.key : undefined,
                  type: (typeof m === "object" && m.type === "VIDEO") ? MediaType.VIDEO : MediaType.IMAGE,
                  altText: typeof m === "object" ? m.altText : undefined,
                  title: typeof m === "object" ? m.title : undefined,
                  description: typeof m === "object" ? m.description : undefined,
                  thumbnailUrl: typeof m === "object" ? m.thumbnailUrl : undefined,
                  mimeType: typeof m === "object" ? m.mimeType : undefined,
                  fileSize: typeof m === "object" && m.fileSize !== undefined ? Number(m.fileSize) : undefined,
                  duration: typeof m === "object" && m.duration !== undefined ? Number(m.duration) : undefined,
                  width: typeof m === "object" && m.width !== undefined ? Number(m.width) : undefined,
                  height: typeof m === "object" && m.height !== undefined ? Number(m.height) : undefined,
                  order: typeof m === "object" && m.order !== undefined ? Number(m.order) : mIdx,
                  isActive: typeof m === "object" ? m.isActive !== false : true,
                });
              });
            }

            if (metaTitle || metaDesc || item.seo) {
              seo.push({
                rowNumber,
                productGroupId: groupId,
                metaTitle,
                metaDesc,
                slug: item.seo?.slug || item.slug,
                schemaMarkup: item.seo?.schemaMarkup || item.schemaMarkup,
              });
            }
          });

          return { products, variants, seo, media };
        } else if (parsed && typeof parsed === "object") {
          return {
            products: Array.isArray(parsed.products) ? parsed.products : [],
            variants: Array.isArray(parsed.variants) ? parsed.variants : [],
            seo: Array.isArray(parsed.seo) ? parsed.seo : [],
            media: Array.isArray(parsed.media) ? parsed.media : [],
          };
        }
      } catch {
        // Fall back to delimited parser
      }
    }

    // 2. CSV / TSV parsing
    return this.parseDelimitedText(trimmed);
  }

  private static parseDelimitedText(text: string): ParsedWorkbookData {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return { products: [], variants: [], seo: [], media: [] };
    }

    // Determine delimiter: tab vs comma
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const parseLine = (line: string): string[] => {
      if (delimiter === "\t") return line.split("\t").map((s) => s.trim());
      // Basic CSV token parser
      const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
      const result: string[] = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        let val = match[1];
        if (val === undefined) break;
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        result.push(val.trim());
        if (regex.lastIndex >= line.length) break;
      }
      return result;
    };

    const header = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const colMap = new Map<string, number>();
    header.forEach((h, idx) => colMap.set(h, idx));

    const getCol = (cols: string[]): number | undefined => {
      for (const c of cols) {
        const idx = colMap.get(c.toLowerCase().replace(/[^a-z0-9]/g, ""));
        if (idx !== undefined) return idx;
      }
      return undefined;
    };

    const colGroupId = getCol(["productgroupid", "groupid", "id"]);
    const colType = getCol(["producttype", "type"]);
    const colName = getCol(["name", "title", "productname"]);
    const colCat = getCol(["categorypath", "category", "cat"]);
    const colBasePrice = getCol(["baseprice", "price", "mrp"]);
    const colSellingPrice = getCol(["sellingprice", "saleprice"]);
    const colSku = getCol(["sku", "productsku"]);
    const colStock = getCol(["stockquantity", "stock", "quantity", "qty"]);
    const colWarehouse = getCol(["warehousecode", "warehouse"]);
    const colDesc = getCol(["description", "desc"]);
    const colImages = getCol(["images", "image", "imageurl", "photo", "photos"]);

    const products: BulkProductRow[] = [];
    const media: BulkMediaRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = parseLine(lines[i]);
      if (parts.length === 0 || !parts.some(Boolean)) continue;

      const rowNumber = i + 1;
      const productGroupId = (colGroupId !== undefined ? parts[colGroupId] : "") || `PROD-${i}`;
      const name = (colName !== undefined ? parts[colName] : "") || `Product ${i}`;
      const basePrice = Number((colBasePrice !== undefined ? parts[colBasePrice] : "0").replace(/[^0-9.]/g, "")) || 0;
      const sellingPrice = Number((colSellingPrice !== undefined ? parts[colSellingPrice] : "").replace(/[^0-9.]/g, "")) || basePrice;

      products.push({
        rowNumber,
        productGroupId,
        productType: (colType !== undefined && parts[colType]?.toLowerCase() === "variable") ? "variable" : "simple",
        name,
        categoryPath: colCat !== undefined ? parts[colCat] : "",
        description: colDesc !== undefined ? parts[colDesc] : "",
        basePrice,
        sellingPrice,
        sku: colSku !== undefined ? parts[colSku] : undefined,
        warehouseCodeOrName: colWarehouse !== undefined ? parts[colWarehouse] : undefined,
        stockQuantity: colStock !== undefined ? Number(parts[colStock]) || 0 : 0,
        lowStockThreshold: 10,
        weight: 500,
        length: 10,
        breadth: 10,
        height: 5,
        isActive: true,
      });

      // Parse image references if provided
      if (colImages !== undefined && parts[colImages]) {
        const imageRefs = parts[colImages].split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
        imageRefs.forEach((ref, mIdx) => {
          media.push({
            rowNumber,
            productGroupId,
            type: MediaType.IMAGE,
            url: ref,
            altText: `${name} Image ${mIdx + 1}`,
            order: mIdx,
            isActive: true,
          });
        });
      }
    }

    return { products, variants: [], seo: [], media };
  }
}

