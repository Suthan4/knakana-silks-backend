import ExcelJS from "exceljs";
import { BulkParsedProduct } from "./bulk-product.dto.js";

export interface CategoryLookupItem {
  id: string;
  name: string;
  path: string;
}

export interface WarehouseLookupItem {
  id: string;
  name: string;
  code: string;
}

export class BulkTemplateGenerator {
  /**
   * Generates a fully formatted .xlsx workbook as a Buffer.
   * Can either generate a clean template with sample rows OR export existing products data.
   */
  public static async generateWorkbook(params: {
    categories: CategoryLookupItem[];
    warehouses: WarehouseLookupItem[];
    products?: BulkParsedProduct[];
    includeSamplesIfEmpty?: boolean;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Kankana Silks Admin";
    workbook.lastModifiedBy = "Kankana Silks Admin";
    workbook.created = new Date();
    workbook.modified = new Date();

    const { categories, warehouses, products = [], includeSamplesIfEmpty = true } = params;

    // 1. Populate Hidden Lookup Data Sheet
    this.createLookupSheet(workbook, categories, warehouses);

    // 2. Sheet 1: Instructions
    this.createInstructionsSheet(workbook);

    // 3. Sheet 2: Products
    this.createProductsSheet(workbook, categories, warehouses, products, includeSamplesIfEmpty);

    // 4. Sheet 3: Variants
    this.createVariantsSheet(workbook, warehouses, products, includeSamplesIfEmpty);

    // 5. Sheet 4: SEO
    this.createSeoSheet(workbook, products, includeSamplesIfEmpty);

    // 6. Sheet 5: Media
    this.createMediaSheet(workbook, products, includeSamplesIfEmpty);

    // Write to buffer
    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. HIDDEN LOOKUP SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static createLookupSheet(
    workbook: ExcelJS.Workbook,
    categories: CategoryLookupItem[],
    warehouses: WarehouseLookupItem[]
  ): ExcelJS.Worksheet {
    const sheet = workbook.addWorksheet("_LookupData", { state: "hidden" });

    // Headers
    sheet.getRow(1).values = [
      "Category Paths",
      "Product Types",
      "Boolean Yes/No",
      "Media Types",
      "Warehouse Codes",
    ];

    // Static enumeration data
    const productTypes = ["simple", "variable"];
    const booleanOptions = ["Yes", "No"];
    const mediaTypes = ["IMAGE", "VIDEO"];

    const maxRows = Math.max(
      categories.length,
      productTypes.length,
      booleanOptions.length,
      mediaTypes.length,
      warehouses.length,
      1
    );

    for (let i = 0; i < maxRows; i++) {
      const row = sheet.getRow(i + 2);
      row.getCell(1).value = categories[i] ? categories[i].path : "";
      row.getCell(2).value = productTypes[i] || "";
      row.getCell(3).value = booleanOptions[i] || "";
      row.getCell(4).value = mediaTypes[i] || "";
      row.getCell(5).value = warehouses[i] ? `${warehouses[i].code} (${warehouses[i].name})` : "";
    }

    // Add comprehensive reference tables to the hidden lookup sheet
    // Section: Field Reference (Worksheet, Column Header, Internal Field, Description, Required, Product Type, Data Type, Valid Values, Example)
    const fieldRefStartRow = maxRows + 3; // one empty row after existing data
    const titleRow = sheet.getRow(fieldRefStartRow);
    titleRow.getCell(1).value = "Workbook Field Reference";
    titleRow.font = { name: "Segoe UI", size: 12, bold: true };
    const headerRow = sheet.getRow(fieldRefStartRow + 1);
    headerRow.values = [
      "Worksheet",
      "Column Header",
      "Internal Field",
      "Description",
      "Required",
      "Product Type",
      "Data Type",
      "Valid Values",
      "Example",
    ];
    headerRow.font = { name: "Segoe UI", bold: true };
    headerRow.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    });
    // Define reference rows for each sheet
    const referenceRows: any[] = [];
    // Products sheet columns
    const productCols = [
      { header: "Product Group ID *", field: "productGroupId", desc: "Unique identifier linking rows across sheets", required: "Yes", type: "simple, variable", dataType: "string", valid: "Alphanumeric, e.g., PROD-001", example: "PROD-001" },
      { header: "Product Name *", field: "name", desc: "Display name of the product", required: "Yes", type: "both", dataType: "string", valid: "-", example: "Kanchipuram Pure Silk Saree" },
      { header: "Category Full Path *", field: "categoryPath", desc: "Full hierarchical category path", required: "Yes", type: "both", dataType: "string", valid: "Values from _LookupData!A column", example: "Clothing > Sarees > Silk Sarees" },
      { header: "Product Type *", field: "productType", desc: "simple or variable", required: "Yes", type: "both", dataType: "enum", valid: "simple, variable", example: "simple" },
      { header: "Description *", field: "description", desc: "Long description for product page", required: "Yes", type: "both", dataType: "string", valid: "-", example: "Handcrafted pure mulberry silk saree..." },
      { header: "Parent / Base SKU", field: "sku", desc: "SKU for simple product or base SKU for variable", required: "No", type: "simple", dataType: "string", valid: "-", example: "KKS-KAN-001" },
      { header: "Base Price (MRP) *", field: "basePrice", desc: "Maximum retail price", required: "Yes", type: "both", dataType: "number", valid: ">0", example: 12500 },
      { header: "Selling Price *", field: "sellingPrice", desc: "Actual selling price (<= Base Price)", required: "Yes", type: "both", dataType: "number", valid: "<= Base Price", example: 9999 },
      { header: "Stock Quantity (Simple)", field: "stockQuantity", desc: "Available stock for simple products", required: "No", type: "simple", dataType: "number", valid: ">=0", example: 15 },
      { header: "Warehouse (Simple)", field: "warehouseCodeOrName", desc: "Warehouse for simple product stock", required: "No", type: "simple", dataType: "string", valid: "Values from _LookupData!E column", example: "WH01 (Main Warehouse)" },
      { header: "Low Stock Alert", field: "lowStockThreshold", desc: "Threshold for low stock notification", required: "No", type: "both", dataType: "number", valid: ">=0", example: 5 },
      { header: "Weight in kg *", field: "weight", desc: "Physical weight", required: "Yes", type: "both", dataType: "number", valid: ">0", example: 0.85 },
      { header: "Length in cm *", field: "length", desc: "Product length", required: "Yes", type: "both", dataType: "number", valid: ">0", example: 40 },
      { header: "Breadth in cm *", field: "breadth", desc: "Product breadth", required: "Yes", type: "both", dataType: "number", valid: ">0", example: 30 },
      { header: "Height in cm *", field: "height", desc: "Product height", required: "Yes", type: "both", dataType: "number", valid: ">0", example: 5 },
      { header: "HSN Code", field: "hsnCode", desc: "Tax code", required: "No", type: "both", dataType: "string", valid: "-", example: "5007" },
      { header: "Artisan Name", field: "artisanName", desc: "Name of artisan", required: "No", type: "both", dataType: "string", valid: "-", example: "Master Weaver Ramanathan" },
      { header: "Artisan Location", field: "artisanLocation", desc: "Location of artisan", required: "No", type: "both", dataType: "string", valid: "-", example: "Kanchipuram, Tamil Nadu" },
      { header: "Artisan About", field: "artisanAbout", desc: "Brief bio", required: "No", type: "both", dataType: "string", valid: "-", example: "Third‑generation master weaver..." },
      { header: "Allow Backorders", field: "allowOutOfStockOrders", desc: "Whether backorders are allowed", required: "No", type: "both", dataType: "enum", valid: "Yes, No", example: "No" },
      { header: "Video Consultation", field: "hasVideoConsultation", desc: "Offer video consult", required: "No", type: "both", dataType: "enum", valid: "Yes, No", example: "Yes" },
      { header: "Video Purchasing", field: "videoPurchasingEnabled", desc: "Enable purchase via video", required: "No", type: "both", dataType: "enum", valid: "Yes, No", example: "Yes" },
      { header: "Video Note", field: "videoConsultationNote", desc: "Additional note for video", required: "No", type: "both", dataType: "string", valid: "-", example: "Live video showing of zari luster..." },
      { header: "Active State", field: "isActive", desc: "Product visibility", required: "No", type: "both", dataType: "enum", valid: "Yes, No", example: "Yes" },
    ];
    productCols.forEach((c) => referenceRows.push(["Products", c.header, c.field, c.desc, c.required, c.type, c.dataType, c.valid, c.example]));
    // Variants sheet columns
    const variantCols = [
      { header: "Product Group ID *", field: "productGroupId", desc: "Links to parent product", required: "Yes", type: "variable", dataType: "string", valid: "-", example: "PROD-002" },
      { header: "Variant SKU *", field: "variantSku", desc: "Unique SKU for variant", required: "Yes", type: "variable", dataType: "string", valid: "-", example: "KKS-DHO-002-GLD-40" },
      { header: "Size", field: "size", desc: "Size attribute", required: "No", type: "variable", dataType: "string", valid: "-", example: "40" },
      { header: "Color", field: "color", desc: "Color attribute", required: "No", type: "variable", dataType: "string", valid: "-", example: "Gold Border" },
      { header: "Fabric", field: "fabric", desc: "Fabric attribute", required: "No", type: "variable", dataType: "string", valid: "-", example: "Silk Cotton" },
      { header: "Other Attributes (Key:Value, ...)", field: "attributes", desc: "Additional key:value pairs", required: "No", type: "variable", dataType: "string", valid: "-", example: "BorderWidth:2 inch" },
      { header: "Base Price Override", field: "basePrice", desc: "Override base price for this variant", required: "No", type: "variable", dataType: "number", valid: ">=0", example: 3500 },
      { header: "Selling Price Override", field: "sellingPrice", desc: "Override selling price", required: "No", type: "variable", dataType: "number", valid: "<= Base Price", example: 2800 },
      { header: "Stock Quantity *", field: "stockQuantity", desc: "Stock for variant", required: "Yes", type: "variable", dataType: "number", valid: ">=0", example: 25 },
      { header: "Warehouse *", field: "warehouseCodeOrName", desc: "Warehouse for variant stock", required: "Yes", type: "variable", dataType: "string", valid: "Values from _LookupData!E column", example: "WH01 (Main Warehouse)" },
      { header: "Low Stock Alert", field: "lowStockThreshold", desc: "Low stock threshold", required: "No", type: "variable", dataType: "number", valid: ">=0", example: 5 },
      { header: "Weight in kg (Override)", field: "weight", desc: "Override weight", required: "No", type: "variable", dataType: "number", valid: ">=0", example: "" },
      { header: "Length in cm (Override)", field: "length", desc: "Override length", required: "No", type: "variable", dataType: "number", valid: ">=0", example: "" },
      { header: "Breadth in cm (Override)", field: "breadth", desc: "Override breadth", required: "No", type: "variable", dataType: "number", valid: ">=0", example: "" },
      { header: "Height in cm (Override)", field: "height", desc: "Override height", required: "No", type: "variable", dataType: "number", valid: ">=0", example: "" },
    ];
    variantCols.forEach((c) => referenceRows.push(["Variants", c.header, c.field, c.desc, c.required, c.type, c.dataType, c.valid, c.example]));
    // SEO sheet columns
    const seoCols = [
      { header: "Product Group ID *", field: "productGroupId", desc: "Links to product", required: "Yes", type: "both", dataType: "string", valid: "-", example: "PROD-001" },
      { header: "SEO Meta Title", field: "metaTitle", desc: "Meta title for SEO", required: "No", type: "both", dataType: "string", valid: "-", example: "Buy Pure Peacock Blue Kanchipuram Silk Saree" },
      { header: "Meta Description",
        field: "metaDesc",
        desc: "Meta description",
        required: "No",
        type: "both",
        dataType: "string",
        valid: "-",
        example: "Shop authentic Kanchipuram pure silk saree..." },
      { header: "Custom URL Slug (Optional)", field: "slug", desc: "Custom slug", required: "No", type: "both", dataType: "string", valid: "-", example: "kanchipuram-pure-silk-saree" },
      { header: "Schema Markup (JSON)", field: "schemaMarkup", desc: "Structured data JSON", required: "No", type: "both", dataType: "string", valid: "JSON", example: "{...}" },
    ];
    seoCols.forEach((c) => referenceRows.push(["SEO", c.header, c.field, c.desc, c.required, c.type, c.dataType, c.valid, c.example]));
    // Media sheet columns
    const mediaCols = [
      { header: "Product Group ID *", field: "productGroupId", desc: "Links to product", required: "Yes", type: "both", dataType: "string", valid: "-", example: "PROD-001" },
      { header: "Variant SKU (Optional)", field: "variantSku", desc: "If media is for a variant", required: "No", type: "both", dataType: "string", valid: "-", example: "KKS-DHO-002-GLD-40" },
      { header: "Media Type *", field: "type", desc: "IMAGE or VIDEO", required: "Yes", type: "both", dataType: "enum", valid: "IMAGE, VIDEO", example: "IMAGE" },
      { header: "Media URL *", field: "url", desc: "Public URL to media", required: "Yes", type: "both", dataType: "string", valid: "HTTPS URL", example: "https://.../image.jpg" },
      { header: "Alt Text", field: "altText", desc: "Alt attribute for accessibility", required: "No", type: "both", dataType: "string", valid: "-", example: "Front view" },
      { header: "Title", field: "title", desc: "Media title", required: "No", type: "both", dataType: "string", valid: "-", example: "Front View" },
      { header: "Description", field: "description", desc: "Long description", required: "No", type: "both", dataType: "string", valid: "-", example: "Full body display..." },
      { header: "Display Order", field: "order", desc: "Ordering index", required: "No", type: "both", dataType: "number", valid: ">=0", example: 0 },
      { header: "Thumbnail URL (Video)", field: "thumbnailUrl", desc: "Thumbnail for video", required: "No", type: "both", dataType: "string", valid: "HTTPS URL", example: "" },
    ];
    mediaCols.forEach((c) => referenceRows.push(["Media", c.header, c.field, c.desc, c.required, c.type, c.dataType, c.valid, c.example]));
    // Write reference rows starting after the header row
    let refIdx = fieldRefStartRow + 2;
    referenceRows.forEach((vals) => {
      const r = sheet.getRow(refIdx++);
      r.values = ["", ...vals]; // shift to column B for readability
      this.applyBorders(r);
    });
    // Optionally adjust column widths for the reference section
    sheet.getColumn(2).width = 30; // Worksheet
    sheet.getColumn(3).width = 30; // Header
    sheet.getColumn(4).width = 30; // Internal field
    sheet.getColumn(5).width = 40; // Description
    sheet.getColumn(6).width = 10; // Required
    sheet.getColumn(7).width = 15; // Product Type
    sheet.getColumn(8).width = 15; // Data Type
    sheet.getColumn(9).width = 30; // Valid Values
    sheet.getColumn(10).width = 30; // Example
    // End of reference section
    return sheet;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. INSTRUCTIONS SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static createInstructionsSheet(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet("Instructions", {
      views: [{ showGridLines: true }],
    });

    sheet.columns = [
      { width: 5 },
      { width: 28 },
      { width: 18 },
      { width: 65 },
      { width: 45 },
    ];

    // Title banner
    sheet.mergeCells("B2:E2");
    const titleCell = sheet.getCell("B2");
    titleCell.value = "KANKANA SILKS — BULK PRODUCT IMPORT INSTRUCTIONS";
    titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Indigo / Navy
    };
    sheet.getRow(2).height = 40;

    // Subtitle
    sheet.mergeCells("B3:E3");
    const subCell = sheet.getCell("B3");
    subCell.value = "Follow these instructions carefully to prepare and import your products into Kankana Silks.";
    subCell.font = { name: "Segoe UI", size: 11, italic: true, color: { argb: "FF475569" } };
    subCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(3).height = 25;

    // Overview section
    const addSectionHeader = (rowNum: number, title: string) => {
      sheet.mergeCells(`B${rowNum}:E${rowNum}`);
      const cell = sheet.getCell(`B${rowNum}`);
      cell.value = title;
      cell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF334155" }, // Slate
      };
      cell.alignment = { vertical: "middle", indent: 1 };
      sheet.getRow(rowNum).height = 28;
    };

    let r = 5;
    addSectionHeader(r++, "1. WORKBOOK STRUCTURE & HOW SHEETS LINK TOGETHER");

    const structureNotes = [
      ["Sheet", "Purpose", "Linking Rule", "Notes"],
      ["Products", "Defines base product information for simple and variable items", "Product Group ID (unique)", "Required. 1 row per product item."],
      ["Variants", "Defines sellable variant combinations (Size, Color, Fabric, Price overrides)", "Product Group ID -> Products sheet", "Required ONLY for variable products. Simple products do not use this."],
      ["SEO", "Search engine optimization metadata (Title, Meta Description, URL Slug)", "Product Group ID -> Products sheet", "Optional. If slug is left blank, it is generated from product name."],
      ["Media", "Product and variant imagery and videos with CDN/R2 URLs", "Product Group ID & optional Variant SKU", "Optional. Multiple media items can be added for each product."],
    ];

    for (const row of structureNotes) {
      const excelRow = sheet.getRow(r++);
      excelRow.values = ["", row[0], row[1], row[2], row[3]];
      if (r === 7) {
        excelRow.font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
        excelRow.eachCell((c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        });
      } else {
        excelRow.font = { name: "Segoe UI", size: 10 };
      }
      excelRow.height = 22;
      this.applyBorders(excelRow);
    }

    r += 1;
    addSectionHeader(r++, "2. KEY RULES FOR SUCCESSFUL BULK UPLOAD");

    const rules = [
      ["Rule", "Requirement", "Explanation"],
      ["Product Group ID", "Must be unique in Products sheet", "Use short alphanumeric codes like PROD-001, PROD-002 to link rows across all sheets."],
      ["Category Full Path", "Select from dropdown", "Always choose a valid full category path (e.g. Sarees > Silk Sarees). Do not type random IDs."],
      ["Pricing Semantics", "Selling Price <= Base Price", "Base Price is the MRP/Original price. Selling Price is the customer purchase price. Both must be positive."],
      ["Simple vs Variable", "productType column", "For 'simple', enter Stock Quantity on Products sheet. For 'variable', enter stock on Variants sheet."],
      ["Variant Uniqueness", "No duplicate attributes", "For the same variable product, every variant must have a unique attribute combination (e.g., Color + Size)."],
      ["Shipping Dimensions", "Length, Breadth, Height, Weight", "Required for accurate shipping calculations (Shiprocket). Max weight: 50kg, Max dimension: 200cm."],
      ["Media URLs", "Valid HTTPS URLs", "Provide publicly accessible image URLs (such as Cloudflare R2 or direct image hosting links)."],
    ];

    for (const rule of rules) {
      const excelRow = sheet.getRow(r++);
      excelRow.values = ["", rule[0], rule[1], rule[2]];
      if (r === 16) {
        excelRow.font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
        excelRow.eachCell((c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        });
      } else {
        excelRow.font = { name: "Segoe UI", size: 10 };
      }
      excelRow.height = 22;
      this.applyBorders(excelRow);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PRODUCTS SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static createProductsSheet(
    workbook: ExcelJS.Workbook,
    categories: CategoryLookupItem[],
    warehouses: WarehouseLookupItem[],
    products: BulkParsedProduct[],
    includeSamples: boolean
  ): void {
    const sheet = workbook.addWorksheet("Products", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });

    const headers = [
      { key: "productGroupId", header: "Product Group ID *", width: 20 },
      { key: "name", header: "Product Name *", width: 35 },
      { key: "categoryPath", header: "Category Full Path *", width: 38 },
      { key: "productType", header: "Product Type *", width: 16 },
      { key: "description", header: "Description *", width: 45 },
      { key: "sku", header: "Parent / Base SKU", width: 22 },
      { key: "basePrice", header: "Base Price (MRP) *", width: 20 },
      { key: "sellingPrice", header: "Selling Price *", width: 18 },
      { key: "stockQuantity", header: "Stock Quantity (Simple)", width: 24 },
      { key: "warehouseCodeOrName", header: "Warehouse (Simple)", width: 26 },
      { key: "lowStockThreshold", header: "Low Stock Alert", width: 16 },
      { key: "weight", header: "Weight in kg *", width: 15 },
      { key: "length", header: "Length in cm *", width: 15 },
      { key: "breadth", header: "Breadth in cm *", width: 15 },
      { key: "height", header: "Height in cm *", width: 15 },
      { key: "hsnCode", header: "HSN Code", width: 15 },
      { key: "artisanName", header: "Artisan Name", width: 22 },
      { key: "artisanLocation", header: "Artisan Location", width: 22 },
      { key: "artisanAbout", header: "Artisan About", width: 30 },
      { key: "allowOutOfStockOrders", header: "Allow Backorders", width: 18 },
      { key: "hasVideoConsultation", header: "Video Consultation", width: 20 },
      { key: "videoPurchasingEnabled", header: "Video Purchasing", width: 18 },
      { key: "videoConsultationNote", header: "Video Note", width: 25 },
      { key: "isActive", header: "Active State", width: 14 },
    ];

    sheet.columns = headers.map((h) => ({ header: h.header, key: h.key, width: h.width }));
    this.styleHeaderRow(sheet.getRow(1));

    // Category path dropdown validation range in _LookupData sheet
    const catCount = Math.max(categories.length, 1);
    const catRange = `='_LookupData'!$A$2:$A$${catCount + 1}`;
    const whCount = Math.max(warehouses.length, 1);
    const whRange = `='_LookupData'!$E$2:$E$${whCount + 1}`;

    const defaultWarehouseStr = warehouses.length > 0 ? `${warehouses[0].code} (${warehouses[0].name})` : "";
    const defaultCatPath = categories.length > 0 ? categories[0].path : "Clothing > Sarees";

    if (products.length > 0) {
      // Export existing products
      for (const p of products) {
        const row = sheet.addRow({
          productGroupId: p.productGroupId,
          name: p.name,
          categoryPath: p.categoryPath || defaultCatPath,
          productType: p.productType,
          description: p.description,
          sku: p.sku || "",
          basePrice: p.basePrice,
          sellingPrice: p.sellingPrice,
          stockQuantity: p.productType === "simple" ? (p.stock?.quantity ?? 0) : "",
          warehouseCodeOrName: p.productType === "simple" ? (p.stock?.warehouseCode || defaultWarehouseStr) : "",
          lowStockThreshold: p.stock?.lowStockThreshold ?? 10,
          weight: p.weight,
          length: p.length,
          breadth: p.breadth,
          height: p.height,
          hsnCode: p.hsnCode || "",
          artisanName: p.artisanName || "",
          artisanLocation: p.artisanLocation || "",
          artisanAbout: p.artisanAbout || "",
          allowOutOfStockOrders: p.allowOutOfStockOrders ? "Yes" : "No",
          hasVideoConsultation: p.hasVideoConsultation ? "Yes" : "No",
          videoPurchasingEnabled: p.videoPurchasingEnabled ? "Yes" : "No",
          videoConsultationNote: p.videoConsultationNote || "",
          isActive: p.isActive !== false ? "Yes" : "No",
        });
        this.applyDataValidationToProductRow(row, catRange, whRange);
      }
    } else if (includeSamples) {
      // Add sample simple product
      const sample1 = sheet.addRow({
        productGroupId: "PROD-001",
        name: "Kanchipuram Pure Silk Saree - Peacock Blue",
        categoryPath: defaultCatPath,
        productType: "simple",
        description: "Handcrafted pure mulberry silk saree featuring traditional peacock zari borders and contrast pallu.",
        sku: "KKS-KAN-001",
        basePrice: 12500,
        sellingPrice: 9999,
        stockQuantity: 15,
        warehouseCodeOrName: defaultWarehouseStr,
        lowStockThreshold: 5,
        weight: 0.85,
        length: 40,
        breadth: 30,
        height: 5,
        hsnCode: "5007",
        artisanName: "Master Weaver Ramanathan",
        artisanLocation: "Kanchipuram, Tamil Nadu",
        artisanAbout: "Third-generation master weaver specializing in traditional korvai weaving technique.",
        allowOutOfStockOrders: "No",
        hasVideoConsultation: "Yes",
        videoPurchasingEnabled: "Yes",
        videoConsultationNote: "Live video showing of zari luster available upon request.",
        isActive: "Yes",
      });
      this.applyDataValidationToProductRow(sample1, catRange, whRange);

      // Add sample variable product
      const sample2 = sheet.addRow({
        productGroupId: "PROD-002",
        name: "Traditional Silk Cotton Dhoti Set",
        categoryPath: defaultCatPath,
        productType: "variable",
        description: "Elegant silk-cotton dhoti set with angavastram, available in multiple border colors and sizes.",
        sku: "KKS-DHO-002",
        basePrice: 3500,
        sellingPrice: 2800,
        stockQuantity: "", // Variable products define stock on Variants sheet
        warehouseCodeOrName: "",
        lowStockThreshold: 10,
        weight: 0.6,
        length: 35,
        breadth: 25,
        height: 4,
        hsnCode: "5208",
        artisanName: "Salem Handloom Guild",
        artisanLocation: "Salem, Tamil Nadu",
        artisanAbout: "Collective of certified weavers preserving traditional South Indian dhotis.",
        allowOutOfStockOrders: "No",
        hasVideoConsultation: "No",
        videoPurchasingEnabled: "No",
        videoConsultationNote: "",
        isActive: "Yes",
      });
      this.applyDataValidationToProductRow(sample2, catRange, whRange);
    }
  }

  private static applyDataValidationToProductRow(
    row: ExcelJS.Row,
    catRange: string,
    whRange: string
  ): void {
    // Col 3: Category Full Path
    row.getCell(3).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [catRange],
      showErrorMessage: true,
      errorTitle: "Invalid Category",
      error: "Please select a category path from the dropdown list.",
    };

    // Col 4: Product Type
    row.getCell(4).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['="_LookupData!$B$2:$B$3"'],
      showErrorMessage: true,
      errorTitle: "Invalid Type",
      error: "Product type must be either 'simple' or 'variable'.",
    };

    // Col 10: Warehouse
    row.getCell(10).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [whRange],
      showErrorMessage: true,
      errorTitle: "Invalid Warehouse",
      error: "Please select a warehouse from the dropdown list.",
    };

    // Col 20, 21, 22, 24: Boolean Yes/No
    for (const col of [20, 21, 22, 24]) {
      row.getCell(col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['="_LookupData!$C$2:$C$3"'],
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. VARIANTS SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static createVariantsSheet(
    workbook: ExcelJS.Workbook,
    warehouses: WarehouseLookupItem[],
    products: BulkParsedProduct[],
    includeSamples: boolean
  ): void {
    const sheet = workbook.addWorksheet("Variants", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });

    const headers = [
      { key: "productGroupId", header: "Product Group ID *", width: 20 },
      { key: "variantSku", header: "Variant SKU *", width: 22 },
      { key: "size", header: "Size", width: 14 },
      { key: "color", header: "Color", width: 18 },
      { key: "fabric", header: "Fabric", width: 20 },
      { key: "attributes", header: "Other Attributes (Key:Value, ...)", width: 35 },
      { key: "basePrice", header: "Base Price Override", width: 20 },
      { key: "sellingPrice", header: "Selling Price Override", width: 20 },
      { key: "stockQuantity", header: "Stock Quantity *", width: 18 },
      { key: "warehouseCodeOrName", header: "Warehouse *", width: 26 },
      { key: "lowStockThreshold", header: "Low Stock Alert", width: 16 },
      { key: "weight", header: "Weight in kg (Override)", width: 22 },
      { key: "length", header: "Length in cm (Override)", width: 22 },
      { key: "breadth", header: "Breadth in cm (Override)", width: 22 },
      { key: "height", header: "Height in cm (Override)", width: 22 },
    ];

    sheet.columns = headers.map((h) => ({ header: h.header, key: h.key, width: h.width }));
    this.styleHeaderRow(sheet.getRow(1));

    const whCount = Math.max(warehouses.length, 1);
    const whRange = `='_LookupData'!$E$2:$E$${whCount + 1}`;
    const defaultWarehouseStr = warehouses.length > 0 ? `${warehouses[0].code} (${warehouses[0].name})` : "";

    let hasExportedVariants = false;
    for (const p of products) {
      if (p.productType === "variable" && p.variants?.length) {
        for (const v of p.variants) {
          hasExportedVariants = true;
          const otherAttrsStr = v.attributes
            ? Object.entries(v.attributes)
                .map(([k, val]) => `${k}:${val}`)
                .join(", ")
            : "";
          const row = sheet.addRow({
            productGroupId: p.productGroupId,
            variantSku: v.sku || "",
            size: v.size || "",
            color: v.color || "",
            fabric: v.fabric || "",
            attributes: otherAttrsStr,
            basePrice: v.basePrice ?? "",
            sellingPrice: v.sellingPrice ?? "",
            stockQuantity: v.stock?.quantity ?? 0,
            warehouseCodeOrName: v.stock?.warehouseCode || defaultWarehouseStr,
            lowStockThreshold: v.stock?.lowStockThreshold ?? 10,
            weight: v.weight ?? "",
            length: v.length ?? "",
            breadth: v.breadth ?? "",
            height: v.height ?? "",
          });
          row.getCell(10).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [whRange],
          };
        }
      }
    }

    if (!hasExportedVariants && includeSamples) {
      // Sample variants linking to PROD-002
      const v1 = sheet.addRow({
        productGroupId: "PROD-002",
        variantSku: "KKS-DHO-002-GLD-40",
        size: "40",
        color: "Gold Border",
        fabric: "Silk Cotton",
        attributes: "BorderWidth: 2 inch, Angavastram: Included",
        basePrice: 3500,
        sellingPrice: 2800,
        stockQuantity: 25,
        warehouseCodeOrName: defaultWarehouseStr,
        lowStockThreshold: 5,
        weight: "",
        length: "",
        breadth: "",
        height: "",
      });
      v1.getCell(10).dataValidation = { type: "list", allowBlank: true, formulae: [whRange] };

      const v2 = sheet.addRow({
        productGroupId: "PROD-002",
        variantSku: "KKS-DHO-002-SIL-42",
        size: "42",
        color: "Silver Border",
        fabric: "Silk Cotton",
        attributes: "BorderWidth: 2.5 inch, Angavastram: Included",
        basePrice: 3800,
        sellingPrice: 3100,
        stockQuantity: 20,
        warehouseCodeOrName: defaultWarehouseStr,
        lowStockThreshold: 5,
        weight: "",
        length: "",
        breadth: "",
        height: "",
      });
      v2.getCell(10).dataValidation = { type: "list", allowBlank: true, formulae: [whRange] };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SEO SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static createSeoSheet(
    workbook: ExcelJS.Workbook,
    products: BulkParsedProduct[],
    includeSamples: boolean
  ): void {
    const sheet = workbook.addWorksheet("SEO", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });

    const headers = [
      { key: "productGroupId", header: "Product Group ID *", width: 20 },
      { key: "metaTitle", header: "SEO Meta Title", width: 35 },
      { key: "metaDesc", header: "Meta Description", width: 50 },
      { key: "slug", header: "Custom URL Slug (Optional)", width: 35 },
      { key: "schemaMarkup", header: "Schema Markup (JSON)", width: 40 },
    ];

    sheet.columns = headers.map((h) => ({ header: h.header, key: h.key, width: h.width }));
    this.styleHeaderRow(sheet.getRow(1));

    let hasExportedSeo = false;
    for (const p of products) {
      if (p.seo) {
        hasExportedSeo = true;
        sheet.addRow({
          productGroupId: p.productGroupId,
          metaTitle: p.seo.metaTitle || "",
          metaDesc: p.seo.metaDesc || "",
          slug: p.seo.slug || "",
          schemaMarkup: p.seo.schemaMarkup || "",
        });
      }
    }

    if (!hasExportedSeo && includeSamples) {
      sheet.addRow({
        productGroupId: "PROD-001",
        metaTitle: "Buy Pure Peacock Blue Kanchipuram Silk Saree | Kankana Silks",
        metaDesc: "Shop authentic Kanchipuram pure silk saree with handcrafted peacock zari work. Worldwide shipping available.",
        slug: "kanchipuram-pure-silk-saree-peacock-blue",
        schemaMarkup: "",
      });
      sheet.addRow({
        productGroupId: "PROD-002",
        metaTitle: "Traditional Silk Cotton Dhoti Set for Weddings | Kankana Silks",
        metaDesc: "Premium silk cotton wedding dhoti set with matching angavastram. Soft, breathable, and authentic.",
        slug: "traditional-silk-cotton-dhoti-set",
        schemaMarkup: "",
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. MEDIA SHEET
  // ─────────────────────────────────────────────────────────────────────────────
  private static createMediaSheet(
    workbook: ExcelJS.Workbook,
    products: BulkParsedProduct[],
    includeSamples: boolean
  ): void {
    const sheet = workbook.addWorksheet("Media", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });

    const headers = [
      { key: "productGroupId", header: "Product Group ID *", width: 20 },
      { key: "variantSku", header: "Variant SKU (Optional)", width: 24 },
      { key: "type", header: "Media Type *", width: 14 },
      { key: "url", header: "Media URL *", width: 45 },
      { key: "altText", header: "Alt Text", width: 30 },
      { key: "title", header: "Title", width: 25 },
      { key: "description", header: "Description", width: 35 },
      { key: "order", header: "Display Order", width: 14 },
      { key: "thumbnailUrl", header: "Thumbnail URL (Video)", width: 40 },
    ];

    sheet.columns = headers.map((h) => ({ header: h.header, key: h.key, width: h.width }));
    this.styleHeaderRow(sheet.getRow(1));

    let hasExportedMedia = false;
    for (const p of products) {
      if (p.media?.length) {
        for (const m of p.media) {
          hasExportedMedia = true;
          const row = sheet.addRow({
            productGroupId: p.productGroupId,
            variantSku: m.variantSku || "",
            type: m.type || "IMAGE",
            url: m.url,
            altText: m.altText || "",
            title: m.title || "",
            description: m.description || "",
            order: m.order ?? 0,
            thumbnailUrl: m.thumbnailUrl || "",
          });
          row.getCell(3).dataValidation = {
            type: "list",
            allowBlank: false,
            formulae: ['="_LookupData!$D$2:$D$3"'],
          };
        }
      }
    }

    if (!hasExportedMedia && includeSamples) {
      const m1 = sheet.addRow({
        productGroupId: "PROD-001",
        variantSku: "",
        type: "IMAGE",
        url: "https://pub-2fbc147a469a4993ad805cbbfb7f8373.r2.dev/products/kanchipuram-peacock-1.jpg",
        altText: "Kanchipuram Silk Saree Full View",
        title: "Front View",
        description: "Full body display showing peacock motifs and pallu",
        order: 0,
        thumbnailUrl: "",
      });
      m1.getCell(3).dataValidation = { type: "list", allowBlank: false, formulae: ['="_LookupData!$D$2:$D$3"'] };

      const m2 = sheet.addRow({
        productGroupId: "PROD-001",
        variantSku: "",
        type: "IMAGE",
        url: "https://pub-2fbc147a469a4993ad805cbbfb7f8373.r2.dev/products/kanchipuram-peacock-pallu.jpg",
        altText: "Kanchipuram Silk Saree Pallu Close-Up",
        title: "Pallu Detail",
        description: "Detailed view of the pure gold zari woven pallu",
        order: 1,
        thumbnailUrl: "",
      });
      m2.getCell(3).dataValidation = { type: "list", allowBlank: false, formulae: ['="_LookupData!$D$2:$D$3"'] };

      const m3 = sheet.addRow({
        productGroupId: "PROD-002",
        variantSku: "KKS-DHO-002-GLD-40",
        type: "IMAGE",
        url: "https://pub-2fbc147a469a4993ad805cbbfb7f8373.r2.dev/products/dhoti-gold-border.jpg",
        altText: "Silk Cotton Dhoti with Gold Border",
        title: "Gold Border Dhoti",
        description: "Folded view of the gold zari border dhoti",
        order: 0,
        thumbnailUrl: "",
      });
      m3.getCell(3).dataValidation = { type: "list", allowBlank: false, formulae: ['="_LookupData!$D$2:$D$3"'] };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLING HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  private static styleHeaderRow(row: ExcelJS.Row): void {
    row.height = 30;
    row.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" }, // Deep Silk Blue
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF0F172A" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FF3B82F6" } },
        right: { style: "thin", color: { argb: "FF3B82F6" } },
      };
    });
  }

  private static applyBorders(row: ExcelJS.Row): void {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }
}

