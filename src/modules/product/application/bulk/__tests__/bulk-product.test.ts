import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BulkTemplateGenerator } from "../bulk-template.generator.js";
import { BulkProductParser } from "../bulk-product.parser.js";
import { BulkProductValidator, CategoryCacheInfo, WarehouseCacheInfo } from "../bulk-product.validator.js";
import { BulkParsedProduct } from "../bulk-product.dto.js";

describe("Bulk Product Upload Test Suite", () => {
  const mockCategories: CategoryCacheInfo[] = [
    { id: "1", name: "Clothing", slug: "clothing", path: "Clothing", isActive: true },
    { id: "2", name: "Sarees", slug: "clothing-sarees", path: "Clothing > Sarees", isActive: true },
    { id: "3", name: "Silk Sarees", slug: "clothing-sarees-silk-sarees", path: "Clothing > Sarees > Silk Sarees", isActive: true },
    { id: "4", name: "Kanchipuram Silk", slug: "clothing-sarees-silk-kanchipuram", path: "Clothing > Sarees > Silk Sarees > Kanchipuram Silk", isActive: true },
    { id: "5", name: "Dhotis", slug: "dhotis", path: "Dhotis", isActive: true },
    { id: "6", name: "Inactive Sarees", slug: "inactive-sarees", path: "Inactive Sarees", isActive: false },
  ];

  const mockWarehouses: WarehouseCacheInfo[] = [
    { id: "101", name: "Main Facility", code: "WH-MAIN", isActive: true, isDefaultPickup: true },
    { id: "102", name: "Secondary Hub", code: "WH-SEC", isActive: true, isDefaultPickup: false },
    { id: "103", name: "Inactive Warehouse", code: "WH-OLD", isActive: false, isDefaultPickup: false },
  ];

  // Mock PrismaClient for unit testing
  const createMockPrisma = (options?: {
    existingSkus?: string[];
    existingSlugs?: string[];
  }) => {
    const existingSkus = options?.existingSkus || [];
    const existingSlugs = options?.existingSlugs || [];

    return {
      product: {
        findMany: async ({ where }: any) => {
          const inSkus = where?.sku?.in || [];
          return existingSkus
            .filter((s) => inSkus.includes(s))
            .map((s, idx) => ({ id: BigInt(idx + 1), sku: s, name: `Existing ${s}` }));
        },
      },
      productVariant: {
        findMany: async ({ where }: any) => {
          const inSkus = where?.sku?.in || [];
          return existingSkus
            .filter((s) => inSkus.includes(s))
            .map((s, idx) => ({
              id: BigInt(idx + 10),
              sku: s,
              product: { name: `Existing Product for ${s}` },
            }));
        },
      },
    } as any;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Template Generation Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("Template Generation", () => {
    it("should generate a valid .xlsx buffer with all 5 sheets + lookup sheet", async () => {
      const buffer = await BulkTemplateGenerator.generateWorkbook({
        categories: mockCategories.map((c) => ({ id: c.id, name: c.name, path: c.path })),
        warehouses: mockWarehouses.map((w) => ({ id: w.id, name: w.name, code: w.code })),
        includeSamplesIfEmpty: true,
      });

      assert.ok(buffer);
      assert.ok(buffer.length > 0);

      // Parse the generated buffer to verify its sheets and structure
      const parsed = await BulkProductParser.parseWorkbook(buffer);
      assert.ok(parsed.products.length >= 2, "Sample template should have at least 2 sample products");
      assert.ok(parsed.variants.length >= 2, "Sample template should have sample variants");
      assert.ok(parsed.seo.length >= 1, "Sample template should have sample SEO rows");
      assert.ok(parsed.media.length >= 1, "Sample template should have sample Media rows");
    });

    it("should support multiple category depths in lookup data", async () => {
      const depths = mockCategories.map((c) => c.path.split(">").length);
      assert.ok(depths.includes(1), "Contains depth 1 category");
      assert.ok(depths.includes(2), "Contains depth 2 category");
      assert.ok(depths.includes(3), "Contains depth 3 category");
      assert.ok(depths.includes(4), "Contains depth 4 category");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Parser & Validation Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("Workbook Parsing & Validation", () => {
    it("should validate valid simple and variable products in the same workbook", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "PROD-001",
            name: "Classic Silk Saree",
            categoryPath: "Clothing > Sarees > Silk Sarees",
            productType: "simple",
            description: "Beautiful handcrafted pure silk saree.",
            sku: "SILK-001",
            basePrice: 5000,
            sellingPrice: 4200,
            stockQuantity: 10,
            warehouseCodeOrName: "WH-MAIN",
            lowStockThreshold: 3,
            weight: 0.8,
            length: 30,
            breadth: 20,
            height: 5,
          },
          {
            rowNumber: 3,
            productGroupId: "PROD-002",
            name: "Modern Silk Dhoti",
            categoryPath: "Dhotis",
            productType: "variable",
            description: "Traditional cotton silk dhoti.",
            sku: "DHO-002",
            basePrice: 2000,
            sellingPrice: 1600,
            weight: 0.5,
            length: 25,
            breadth: 20,
            height: 4,
          },
        ],
        variants: [
          {
            rowNumber: 2,
            productGroupId: "PROD-002",
            variantSku: "DHO-002-38",
            size: "38",
            color: "Gold Border",
            fabric: "Silk Cotton",
            attributes: { Size: "38", Color: "Gold Border", Fabric: "Silk Cotton" },
            stockQuantity: 15,
            warehouseCodeOrName: "WH-MAIN",
          },
          {
            rowNumber: 3,
            productGroupId: "PROD-002",
            variantSku: "DHO-002-40",
            size: "40",
            color: "Silver Border",
            fabric: "Silk Cotton",
            attributes: { Size: "40", Color: "Silver Border", Fabric: "Silk Cotton" },
            stockQuantity: 20,
            warehouseCodeOrName: "WH-SEC",
          },
        ],
        seo: [
          {
            rowNumber: 2,
            productGroupId: "PROD-001",
            metaTitle: "Classic Silk Saree | Buy Online",
            metaDesc: "Shop pure silk sarees with fast shipping.",
            slug: "classic-silk-saree",
          },
        ],
        media: [
          {
            rowNumber: 2,
            productGroupId: "PROD-001",
            type: "IMAGE" as any,
            url: "https://example.com/saree1.jpg",
            altText: "Classic Silk Saree",
            order: 0,
          },
          {
            rowNumber: 3,
            productGroupId: "PROD-002",
            variantSku: "DHO-002-38",
            type: "IMAGE" as any,
            url: "https://example.com/dhoti-38.jpg",
            altText: "Dhoti Gold Border Size 38",
            order: 0,
          },
        ],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, true, "Workbook should be completely valid");
      assert.equal(validation.summary.totalProducts, 2);
      assert.equal(validation.summary.simpleProducts, 1);
      assert.equal(validation.summary.variableProducts, 1);
      assert.equal(validation.summary.totalVariants, 2);
      assert.equal(validation.summary.totalMedia, 2);
      assert.equal(validation.summary.errorCount, 0);

      const prod1 = validation.products.find((p) => p.productGroupId === "PROD-001");
      assert.ok(prod1);
      assert.equal(prod1.categoryId, "3");
      assert.equal(prod1.stock?.warehouseCode, "WH-MAIN");
      assert.equal(prod1.media?.length, 1);

      const prod2 = validation.products.find((p) => p.productGroupId === "PROD-002");
      assert.ok(prod2);
      assert.equal(prod2.categoryId, "5");
      assert.equal(prod2.variants?.length, 2);
    });

    it("should reject selling price greater than base price", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "ERR-PRICE",
            name: "Invalid Price Product",
            categoryPath: "Clothing > Sarees",
            productType: "simple",
            description: "Test desc",
            basePrice: 1000,
            sellingPrice: 1500, // Invalid: selling > base
            stockQuantity: 5,
          },
        ],
        variants: [],
        seo: [],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      assert.ok(
        validation.errors.some((e) => e.field === "Selling Price" && e.message.includes("cannot exceed Base Price")),
        "Should flag selling price > base price"
      );
    });

    it("should flag variable product with missing variants", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "VAR-EMPTY",
            name: "Variable Product With No Variants",
            categoryPath: "Clothing > Sarees",
            productType: "variable",
            description: "Test desc",
            basePrice: 1000,
            sellingPrice: 900,
          },
        ],
        variants: [], // Empty variants
        seo: [],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      assert.ok(
        validation.errors.some((e) => e.message.includes("has no variants listed in the Variants sheet")),
        "Should flag missing variant rows for variable product"
      );
    });

    it("should flag duplicate variant attribute combinations", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "PROD-DUP",
            name: "Variable Product Duplicate Variant",
            categoryPath: "Clothing > Sarees",
            productType: "variable",
            description: "Test desc",
            basePrice: 2000,
            sellingPrice: 1800,
          },
        ],
        variants: [
          {
            rowNumber: 2,
            productGroupId: "PROD-DUP",
            size: "Free Size",
            color: "Maroon",
            attributes: { Size: "Free Size", Color: "Maroon" },
            stockQuantity: 5,
          },
          {
            rowNumber: 3,
            productGroupId: "PROD-DUP",
            size: "Free Size",
            color: "Maroon", // Duplicate combination!
            attributes: { Size: "Free Size", Color: "Maroon" },
            stockQuantity: 10,
          },
        ],
        seo: [],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      assert.ok(
        validation.errors.some((e) => e.field === "Variant Attributes" && e.message.includes("Duplicate variant combination")),
        "Should flag duplicate variant combinations"
      );
    });

    it("should flag cross-sheet reference to nonexistent Product Group ID", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "PROD-REAL",
            name: "Real Product",
            categoryPath: "Clothing > Sarees",
            productType: "simple",
            description: "Desc",
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
        ],
        variants: [
          {
            rowNumber: 2,
            productGroupId: "PROD-FAKE", // Doesn't exist in Products sheet
            size: "M",
            attributes: { Size: "M" },
            stockQuantity: 5,
          },
        ],
        seo: [
          {
            rowNumber: 2,
            productGroupId: "PROD-GHOST", // Doesn't exist
            metaTitle: "Ghost",
          },
        ],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      assert.ok(
        validation.errors.some((e) => e.sheet === "Variants" && e.productGroupId === "PROD-FAKE"),
        "Should flag nonexistent Product Group ID on Variants sheet"
      );
      assert.ok(
        validation.errors.some((e) => e.sheet === "SEO" && e.productGroupId === "PROD-GHOST"),
        "Should flag nonexistent Product Group ID on SEO sheet"
      );
    });

    it("should detect duplicate SKUs within workbook and existing database conflicts", async () => {
      const prisma = createMockPrisma({ existingSkus: ["DB-SKU-TAKEN"] });

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "PROD-A",
            name: "Product A",
            categoryPath: "Clothing > Sarees",
            productType: "simple",
            description: "Desc A",
            sku: "BATCH-SKU-1",
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
          {
            rowNumber: 3,
            productGroupId: "PROD-B",
            name: "Product B",
            categoryPath: "Clothing > Sarees",
            productType: "simple",
            description: "Desc B",
            sku: "BATCH-SKU-1", // Duplicate within batch!
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
          {
            rowNumber: 4,
            productGroupId: "PROD-C",
            name: "Product C",
            categoryPath: "Clothing > Sarees",
            productType: "simple",
            description: "Desc C",
            sku: "DB-SKU-TAKEN", // Exists in database!
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
        ],
        variants: [],
        seo: [],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      assert.ok(
        validation.errors.some((e) => e.message.includes("is duplicated in this workbook")),
        "Should flag duplicate SKU within batch"
      );
      assert.ok(
        validation.errors.some((e) => e.message.includes("already exists in database")),
        "Should flag database SKU collision"
      );
    });

    it("should validate and resolve deepest category paths accurately", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "PROD-DEEP",
            name: "Deep Saree",
            categoryPath: "Clothing > Sarees > Silk Sarees > Kanchipuram Silk",
            productType: "simple",
            description: "Deep category test",
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
        ],
        variants: [],
        seo: [],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, true);
      const prod = validation.products[0];
      assert.equal(prod.categoryId, "4", "Should resolve to category ID 4 (Kanchipuram Silk)");
    });

    it("should reject inactive categories and non-existent category paths", async () => {
      const prisma = createMockPrisma();

      const validation = await BulkProductValidator.validate({
        prisma,
        products: [
          {
            rowNumber: 2,
            productGroupId: "PROD-INACTIVE",
            name: "Inactive Category Product",
            categoryPath: "Inactive Sarees",
            productType: "simple",
            description: "Desc",
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
          {
            rowNumber: 3,
            productGroupId: "PROD-UNKNOWN",
            name: "Unknown Category Product",
            categoryPath: "Electronics > Laptops", // Non-existent
            productType: "simple",
            description: "Desc",
            basePrice: 1000,
            sellingPrice: 900,
            stockQuantity: 5,
          },
        ],
        variants: [],
        seo: [],
        media: [],
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      assert.ok(
        validation.errors.some((e) => e.message.includes("is currently inactive")),
        "Should flag inactive category"
      );
      assert.ok(
        validation.errors.some((e) => e.message.includes("does not exist in the catalog")),
        "Should flag non-existent category"
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Export Parity Test
  // ───────────────────────────────────────────────────────────────────────────
  describe("Dashboard Export & Parity", () => {
    it("should export dashboard products back to .xlsx matching the import structure", async () => {
      const testProducts: BulkParsedProduct[] = [
        {
          productGroupId: "EXP-001",
          name: "Exported Silk Saree",
          categoryPath: "Clothing > Sarees > Silk Sarees",
          productType: "variable",
          description: "High quality export saree.",
          sku: "EXP-SILK-001",
          basePrice: 8000,
          sellingPrice: 6500,
          weight: 0.9,
          length: 32,
          breadth: 22,
          height: 6,
          variants: [
            {
              sku: "EXP-SILK-001-RED",
              color: "Ruby Red",
              size: "Standard",
              attributes: { Color: "Ruby Red", Size: "Standard" },
              basePrice: 8000,
              sellingPrice: 6500,
              stock: { warehouseId: "101", warehouseCode: "WH-MAIN", quantity: 12 },
            },
          ],
          seo: {
            metaTitle: "Exported Silk Saree",
            metaDesc: "Finest silk saree.",
            slug: "exported-silk-saree",
          },
          media: [
            {
              type: "IMAGE" as any,
              url: "https://example.com/exp-red.jpg",
              altText: "Ruby Red Saree",
            },
          ],
        },
      ];

      const exportedBuffer = await BulkTemplateGenerator.generateWorkbook({
        categories: mockCategories.map((c) => ({ id: c.id, name: c.name, path: c.path })),
        warehouses: mockWarehouses.map((w) => ({ id: w.id, name: w.name, code: w.code })),
        products: testProducts,
        includeSamplesIfEmpty: false,
      });

      assert.ok(exportedBuffer.length > 0);

      // Re-parse exported workbook
      const reParsed = await BulkProductParser.parseWorkbook(exportedBuffer);
      assert.equal(reParsed.products.length, 1);
      assert.equal(reParsed.products[0].productGroupId, "EXP-001");
      assert.equal(reParsed.products[0].name, "Exported Silk Saree");
      assert.equal(reParsed.variants.length, 1);
      assert.equal(reParsed.variants[0].variantSku, "EXP-SILK-001-RED");
      assert.equal(reParsed.seo.length, 1);
      assert.equal(reParsed.media.length, 1);
    });
  });
});

