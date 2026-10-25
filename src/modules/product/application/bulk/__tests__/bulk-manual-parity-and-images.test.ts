import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BulkProductParser } from "../bulk-product.parser.js";
import { BulkProductValidator } from "../bulk-product.validator.js";
import { BulkProductService } from "../../service/bulk-product.service.js";
import { MediaType } from "@/generated/prisma/enums.js";

describe("Bulk Product Upload — Manual Product Creation & S3 Image Parity Test Suite", () => {
  const mockCategories = [
    {
      id: "12",
      name: "Silk Sarees",
      slug: "silk-sarees",
      path: "Clothing > Sarees > Silk Sarees",
      isActive: true,
    },
    {
      id: "14",
      name: "Banarasi Sarees",
      slug: "banarasi-sarees",
      path: "Clothing > Sarees > Banarasi Sarees",
      isActive: true,
    },
  ];

  const mockWarehouses = [
    {
      id: "1",
      name: "Main Warehouse",
      code: "WH-MAIN",
      isActive: true,
      isDefaultPickup: true,
    },
    {
      id: "2",
      name: "Secondary Warehouse",
      code: "WH-SEC",
      isActive: true,
      isDefaultPickup: false,
    },
  ];

  const mockPrisma: any = {
    product: {
      findMany: async () => [],
    },
    productVariant: {
      findMany: async () => [],
    },
    category: {
      findMany: async () => [
        {
          id: BigInt(12),
          name: "Silk Sarees",
          slug: "silk-sarees",
          isActive: true,
          parentPlacements: [],
          childPlacements: [],
        },
        {
          id: BigInt(14),
          name: "Banarasi Sarees",
          slug: "banarasi-sarees",
          isActive: true,
          parentPlacements: [],
          childPlacements: [],
        },
      ],
    },
    warehouse: {
      findMany: async () => [
        {
          id: BigInt(1),
          name: "Main Warehouse",
          code: "WH-MAIN",
          isActive: true,
          isDefaultPickup: true,
        },
        {
          id: BigInt(2),
          name: "Secondary Warehouse",
          code: "WH-SEC",
          isActive: true,
          isDefaultPickup: false,
        },
      ],
    },
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Multiple S3 Image URLs on Simple Products & Unified Preview
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simple Product with Multiple S3 Image URLs", () => {
    const simpleProductJson = JSON.stringify([
      {
        name: "Kanchipuram Pure Silk Saree",
        description: "Handcrafted pure mulberry silk saree with authentic gold zari border.",
        categoryId: "12",
        categoryPath: "Clothing > Sarees > Silk Sarees",
        basePrice: 12500,
        sellingPrice: 11000,
        sku: "KAN-SILK-001",
        isActive: true,
        hasVariants: false,
        hsnCode: "5007",
        weight: 0.85,
        length: 30.0,
        breadth: 20.0,
        height: 5.0,
        artisanName: "Ramasamy M.",
        artisanLocation: "Kanchipuram, Tamil Nadu",
        metaTitle: "Buy Kanchipuram Pure Silk Saree Online",
        metaDesc: "Authentic Kanchipuram silk saree with hand-woven zari border.",
        specifications: [
          { key: "Fabric", value: "Pure Mulberry Silk" },
          { key: "Zari Type", value: "Pure Gold Zari" },
        ],
        stock: {
          warehouseId: "1",
          quantity: 15,
          lowStockThreshold: 3,
        },
        media: [
          {
            type: "IMAGE",
            url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-front.jpg",
            key: "products/kanchi-front.jpg",
            order: 0,
            altText: "Front view of silk saree",
          },
          {
            type: "IMAGE",
            url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-back.jpg",
            key: "products/kanchi-back.jpg",
            order: 1,
            altText: "Back view of silk saree",
          },
          {
            type: "IMAGE",
            url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-pallu.jpg",
            key: "products/kanchi-pallu.jpg",
            order: 2,
            altText: "Pallu zari detail view",
          },
        ],
      },
    ]);

    it("should parse all multiple S3 image URLs and specifications from JSON", () => {
      const parsed = BulkProductParser.parseRawText(simpleProductJson);

      assert.equal(parsed.products.length, 1);
      assert.equal(parsed.products[0].name, "Kanchipuram Pure Silk Saree");
      assert.equal(parsed.products[0].specifications?.length, 2);
      assert.equal(parsed.products[0].specifications?.[0].key, "Fabric");

      // All 3 images parsed and not reduced
      assert.equal(parsed.media.length, 3);
      assert.equal(
        parsed.media[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-front.jpg"
      );
      assert.equal(
        parsed.media[1].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-back.jpg"
      );
      assert.equal(
        parsed.media[2].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-pallu.jpg"
      );
      assert.equal(parsed.media[0].key, "products/kanchi-front.jpg");
    });

    it("should validate and display all product images together in a single allImages preview in correct order", async () => {
      const parsed = BulkProductParser.parseRawText(simpleProductJson);
      const validation = await BulkProductValidator.validate({
        prisma: mockPrisma,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, true);
      assert.equal(validation.products.length, 1);

      const product = validation.products[0];
      // Product-level media has all 3 images
      assert.equal(product.media?.length, 3);
      // allImages contains all 3 images together in a single preview
      assert.ok(product.allImages);
      assert.equal(product.allImages.length, 3);
      assert.equal(product.allImages[0].order, 0);
      assert.equal(product.allImages[1].order, 1);
      assert.equal(product.allImages[2].order, 2);
      assert.equal(
        product.allImages[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-front.jpg"
      );
      assert.equal(product.allImages[0].key, "products/kanchi-front.jpg");
      assert.equal(product.allImages[0].source, "product");

      // Verify totalMedia count in summary includes all images
      assert.equal(validation.summary.totalMedia, 3);
    });

    it("should pass exact manual CreateProductDTO structure to ProductService without rewriting S3 URLs", async () => {
      const parsed = BulkProductParser.parseRawText(simpleProductJson);
      const validation = await BulkProductValidator.validate({
        prisma: mockPrisma,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      let capturedDto: any = null;
      const mockProductService: any = {
        createProduct: async (dto: any) => {
          capturedDto = dto;
          return {
            id: BigInt(501),
            sku: dto.sku || "AUTO-001",
            name: dto.name,
          };
        },
      };

      const bulkService = new BulkProductService(
        mockPrisma,
        {} as any,
        {} as any,
        mockProductService
      );

      const res = await bulkService.importProducts(validation.products);
      assert.equal(res.successful, 1);
      assert.equal(res.failed, 0);
      assert.equal(res.results[0].productId, "501");

      // Verify captured DTO matches manual CreateProduct schema
      assert.ok(capturedDto);
      assert.equal(capturedDto.name, "Kanchipuram Pure Silk Saree");
      assert.equal(capturedDto.categoryId, "12");
      assert.equal(capturedDto.hasVariants, false);
      assert.equal(capturedDto.specifications?.length, 2);
      assert.equal(capturedDto.specifications[0].key, "Fabric");
      assert.equal(capturedDto.specifications[0].value, "Pure Mulberry Silk");

      // Verify ALL multiple S3 image URLs are preserved
      assert.equal(capturedDto.media.length, 3);
      assert.equal(
        capturedDto.media[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-front.jpg"
      );
      assert.equal(capturedDto.media[0].key, "products/kanchi-front.jpg");
      assert.equal(capturedDto.media[0].order, 0);
      assert.equal(
        capturedDto.media[1].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-back.jpg"
      );
      assert.equal(capturedDto.media[1].order, 1);
      assert.equal(
        capturedDto.media[2].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-pallu.jpg"
      );
      assert.equal(capturedDto.media[2].order, 2);

      // Verify stock
      assert.equal(capturedDto.stock.warehouseId, "1");
      assert.equal(capturedDto.stock.quantity, 15);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Variable Product with Product Media & Variant Media
  // ───────────────────────────────────────────────────────────────────────────
  describe("Variable Product with Multiple S3 Image URLs on Product & Variants", () => {
    const variableProductJson = JSON.stringify([
      {
        name: "Banarasi Katan Silk Saree",
        description: "Traditional Banarasi Katan silk saree with floral jaal weaving.",
        categoryId: "14",
        categoryPath: "Clothing > Sarees > Banarasi Sarees",
        basePrice: 18000,
        sellingPrice: 16500,
        hasVariants: true,
        weight: 1.1,
        length: 35.0,
        breadth: 22.0,
        height: 6.0,
        media: [
          {
            type: "IMAGE",
            url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/banarasi-overview.jpg",
            key: "products/banarasi-overview.jpg",
            order: 0,
            altText: "Overview of Banarasi Saree",
          },
        ],
        variants: [
          {
            sku: "BAN-KATAN-ROYAL-BLUE",
            title: "Royal Blue",
            price: 16500,
            stock: { warehouseId: "1", quantity: 8 },
            attributes: { Color: "Royal Blue" },
            media: [
              {
                type: "IMAGE",
                url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/ban-blue-1.jpg",
                key: "products/ban-blue-1.jpg",
                order: 1,
                altText: "Royal Blue Front View",
              },
              {
                type: "IMAGE",
                url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/ban-blue-2.jpg",
                key: "products/ban-blue-2.jpg",
                order: 2,
                altText: "Royal Blue Pallu View",
              },
            ],
          },
          {
            sku: "BAN-KATAN-EMERALD-GREEN",
            title: "Emerald Green",
            price: 17000,
            stock: { warehouseId: "1", quantity: 5 },
            attributes: [{ name: "Color", value: "Emerald Green" }],
            media: [
              {
                type: "IMAGE",
                url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/ban-green-1.jpg",
                key: "products/ban-green-1.jpg",
                order: 3,
                altText: "Emerald Green Front View",
              },
            ],
          },
        ],
      },
    ]);

    it("should display all product and variant images together in a single allImages preview array", async () => {
      const parsed = BulkProductParser.parseRawText(variableProductJson);
      const validation = await BulkProductValidator.validate({
        prisma: mockPrisma,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, true);
      const product = validation.products[0];

      // Product-level media has 1 overview image
      assert.equal(product.media?.length, 1);
      assert.equal(
        product.media?.[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/banarasi-overview.jpg"
      );

      // Variants have their respective media
      assert.equal(product.variants?.length, 2);
      assert.equal(product.variants?.[0].media?.length, 2);
      assert.equal(product.variants?.[1].media?.length, 1);

      // ALL 4 images are displayed together in allImages preview!
      assert.ok(product.allImages);
      assert.equal(product.allImages.length, 4);

      // Check ordered preview
      assert.equal(product.allImages[0].order, 0);
      assert.equal(product.allImages[0].source, "product");
      assert.equal(product.allImages[1].order, 1);
      assert.equal(product.allImages[1].source, "variant");
      assert.equal(product.allImages[1].variantSku, "BAN-KATAN-ROYAL-BLUE");
      assert.equal(product.allImages[2].order, 2);
      assert.equal(product.allImages[2].source, "variant");
      assert.equal(product.allImages[2].variantSku, "BAN-KATAN-ROYAL-BLUE");
      assert.equal(product.allImages[3].order, 3);
      assert.equal(product.allImages[3].source, "variant");
      assert.equal(product.allImages[3].variantSku, "BAN-KATAN-EMERALD-GREEN");

      // Verify total media count
      assert.equal(validation.summary.totalMedia, 4);
    });

    it("should import variable product preserving variant media associations and S3 URLs", async () => {
      const parsed = BulkProductParser.parseRawText(variableProductJson);
      const validation = await BulkProductValidator.validate({
        prisma: mockPrisma,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      let capturedDto: any = null;
      const mockProductService: any = {
        createProduct: async (dto: any) => {
          capturedDto = dto;
          return {
            id: BigInt(702),
            sku: dto.sku || "AUTO-002",
            name: dto.name,
          };
        },
      };

      const bulkService = new BulkProductService(
        mockPrisma,
        {} as any,
        {} as any,
        mockProductService
      );

      const res = await bulkService.importProducts(validation.products);
      assert.equal(res.successful, 1);

      assert.ok(capturedDto);
      assert.equal(capturedDto.hasVariants, true);
      // Product media
      assert.equal(capturedDto.media?.length, 1);
      assert.equal(
        capturedDto.media[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/banarasi-overview.jpg"
      );

      // Variant media
      assert.equal(capturedDto.variants?.length, 2);
      const v1 = capturedDto.variants[0];
      assert.equal(v1.sku, "BAN-KATAN-ROYAL-BLUE");
      assert.equal(v1.media?.length, 2);
      assert.equal(
        v1.media[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/ban-blue-1.jpg"
      );
      assert.equal(
        v1.media[1].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/ban-blue-2.jpg"
      );

      const v2 = capturedDto.variants[1];
      assert.equal(v2.sku, "BAN-KATAN-EMERALD-GREEN");
      assert.equal(v2.media?.length, 1);
      assert.equal(
        v2.media[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/ban-green-1.jpg"
      );
      // Verify attribute normalization from array to record
      assert.equal(v2.attributes?.Color, "Emerald Green");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Edit / Update Product Behavior
  // ───────────────────────────────────────────────────────────────────────────
  describe("Edit Product Behavior via Bulk Pipeline", () => {
    const editProductJson = JSON.stringify([
      {
        id: "999",
        name: "Updated Kanchipuram Pure Silk Saree",
        description: "Updated description for pure silk saree.",
        categoryId: "12",
        categoryPath: "Clothing > Sarees > Silk Sarees",
        basePrice: 14000,
        sellingPrice: 12000,
        sku: "KAN-SILK-EXISTING",
        weight: 0.9,
        length: 30.0,
        breadth: 20.0,
        height: 5.0,
        media: [
          {
            type: "IMAGE",
            url: "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-updated.jpg",
            order: 0,
          },
        ],
        stock: {
          warehouseId: "1",
          quantity: 20,
        },
      },
    ]);

    it("should recognize existing product with ID and call ProductService.updateProduct", async () => {
      const parsed = BulkProductParser.parseRawText(editProductJson);
      assert.equal(parsed.products[0].id, "999");

      const mockPrismaWithExisting: any = {
        ...mockPrisma,
        product: {
          findMany: async () => [
            { id: BigInt(999), sku: "KAN-SILK-EXISTING", name: "Old Name" },
          ],
        },
        productVariant: {
          findMany: async () => [],
        },
      };

      const validation = await BulkProductValidator.validate({
        prisma: mockPrismaWithExisting,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      // Should not flag duplicate SKU error because the SKU belongs to product 999 itself
      assert.equal(validation.valid, true);
      assert.equal(validation.products[0].id, "999");

      let updatedId: string | null = null;
      let capturedUpdateDto: any = null;
      const mockProductService: any = {
        updateProduct: async (id: string, dto: any) => {
          updatedId = id;
          capturedUpdateDto = dto;
          return {
            id: BigInt(id),
            sku: dto.sku,
            name: dto.name,
          };
        },
      };

      const bulkService = new BulkProductService(
        mockPrismaWithExisting,
        {} as any,
        {} as any,
        mockProductService
      );

      const res = await bulkService.importProducts(validation.products);
      assert.equal(res.successful, 1);
      assert.equal(updatedId, "999");
      assert.equal(capturedUpdateDto.name, "Updated Kanchipuram Pure Silk Saree");
      assert.equal(capturedUpdateDto.basePrice, 14000);
      assert.equal(capturedUpdateDto.sellingPrice, 12000);
      assert.equal(
        capturedUpdateDto.media[0].url,
        "https://kangana-silks.s3.ap-south-1.amazonaws.com/products/kanchi-updated.jpg"
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Invalid or Missing Media URLs Handling
  // ───────────────────────────────────────────────────────────────────────────
  describe("Invalid & Missing Image URL Handling", () => {
    it("should flag validation error for invalid media URL", async () => {
      const invalidUrlJson = JSON.stringify([
        {
          name: "Test Saree",
          categoryId: "12",
          categoryPath: "Clothing > Sarees > Silk Sarees",
          basePrice: 5000,
          sellingPrice: 4500,
          weight: 0.5,
          length: 10,
          breadth: 10,
          height: 5,
          media: [
            {
              type: "IMAGE",
              url: "http://[invalid-url-format",
              order: 0,
            },
          ],
        },
      ]);

      const parsed = BulkProductParser.parseRawText(invalidUrlJson);
      const validation = await BulkProductValidator.validate({
        prisma: mockPrisma,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      const mediaErr = validation.errors.find((e) => e.field === "Media URL");
      assert.ok(mediaErr);
      assert.equal(mediaErr?.severity, "error");
    });

    it("should flag validation error for empty media URL", async () => {
      const emptyUrlJson = JSON.stringify([
        {
          name: "Test Saree Empty",
          categoryId: "12",
          categoryPath: "Clothing > Sarees > Silk Sarees",
          basePrice: 5000,
          sellingPrice: 4500,
          weight: 0.5,
          length: 10,
          breadth: 10,
          height: 5,
          media: [
            {
              type: "IMAGE",
              url: "",
              order: 0,
            },
          ],
        },
      ]);

      const parsed = BulkProductParser.parseRawText(emptyUrlJson);
      const validation = await BulkProductValidator.validate({
        prisma: mockPrisma,
        products: parsed.products,
        variants: parsed.variants,
        seo: parsed.seo,
        media: parsed.media,
        categoryList: mockCategories,
        warehouseList: mockWarehouses,
      });

      assert.equal(validation.valid, false);
      const mediaErr = validation.errors.find((e) => e.field === "Media URL");
      assert.ok(mediaErr);
      assert.equal(mediaErr?.message, "Media URL or file reference is required.");
    });
  });
});
