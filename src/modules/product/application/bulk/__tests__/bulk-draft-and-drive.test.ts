import "reflect-metadata";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DriveImageMatcherService } from "../drive-image-matcher.service.js";
import { BulkProductParser } from "../bulk-product.parser.js";
import { BulkImportDraftService } from "../bulk-import-draft.service.js";
import { BulkImportJobService } from "../bulk-import-job.service.js";
import { MediaType } from "@/generated/prisma/enums.js";

describe("Bulk Import Drafts & Drive Matching Test Suite", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Google Drive Image Matcher Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("DriveImageMatcherService", () => {
    const mockDriveFiles = [
      { id: "file-1", name: "saree-red-001.jpg", mimeType: "image/jpeg" },
      { id: "file-2", name: "saree-blue-001.jpg", mimeType: "image/jpeg" },
      { id: "file-3", name: "saree-blue-001.png", mimeType: "image/png" }, // Ambiguous candidate with file-2
      { id: "file-4", name: "dhoti-silk-white.jpg", mimeType: "image/jpeg" },
    ];

    const mockDriveService: any = {
      listFolderFiles: async (_userId: string, folderId: string) => {
        if (folderId === "invalid-folder") {
          throw new Error("Folder not accessible");
        }
        return mockDriveFiles;
      },
    };

    it("should match exact filenames and return previewUrl", async () => {
      const matcher = new DriveImageMatcherService(mockDriveService);
      const mediaList: any[] = [
        { url: "saree-red-001.jpg", type: MediaType.IMAGE, order: 0 },
      ];

      const res = await matcher.match("user-1", "folder-123", mediaList);

      assert.equal(res.matched.length, 1);
      assert.equal(res.matched[0].file.id, "file-1");
      assert.equal(res.matched[0].file.previewUrl, "/api/products/bulk/drive-proxy/file-1");
      assert.equal(res.missing.length, 0);
      assert.equal(res.ambiguous.length, 0);
    });

    it("should match base names without extension", async () => {
      const matcher = new DriveImageMatcherService(mockDriveService);
      const mediaList: any[] = [
        { url: "dhoti-silk-white", type: MediaType.IMAGE, order: 0 },
      ];

      const res = await matcher.match("user-1", "folder-123", mediaList);

      assert.equal(res.matched.length, 1);
      assert.equal(res.matched[0].file.id, "file-4");
      assert.equal(res.missing.length, 0);
    });

    it("should flag missing files when reference does not exist in Drive folder", async () => {
      const matcher = new DriveImageMatcherService(mockDriveService);
      const mediaList: any[] = [
        { url: "nonexistent-saree.jpg", type: MediaType.IMAGE, order: 0 },
      ];

      const res = await matcher.match("user-1", "folder-123", mediaList);

      assert.equal(res.matched.length, 0);
      assert.equal(res.missing.length, 1);
      assert.equal(res.missing[0].reference, "nonexistent-saree.jpg");
    });

    it("should flag ambiguous files when multiple Drive files share the base name", async () => {
      const matcher = new DriveImageMatcherService(mockDriveService);
      const mediaList: any[] = [
        { url: "saree-blue-001", type: MediaType.IMAGE, order: 0 }, // matches file-2 (.jpg) and file-3 (.png)
      ];

      const res = await matcher.match("user-1", "folder-123", mediaList);

      assert.equal(res.ambiguous.length, 1);
      assert.equal(res.ambiguous[0].candidates.length, 2);
      assert.ok(res.ambiguous[0].candidates.some((c) => c.id === "file-2"));
      assert.ok(res.ambiguous[0].candidates.some((c) => c.id === "file-3"));
    });

    it("should flag duplicate references when multiple media rows use the same photo", async () => {
      const matcher = new DriveImageMatcherService(mockDriveService);
      const mediaList: any[] = [
        { url: "saree-red-001.jpg", type: MediaType.IMAGE, order: 0 },
        { url: "saree-red-001.jpg", type: MediaType.IMAGE, order: 1 },
      ];

      const res = await matcher.match("user-1", "folder-123", mediaList);

      assert.equal(res.duplicates.length, 1);
      assert.deepEqual(res.duplicates[0].occurrences, [0, 1]);
      assert.equal(res.duplicates[0].reference, "saree-red-001.jpg");
      assert.equal(res.matched.length, 2);
    });

    it("should respect confirmed assignments and override ambiguity or auto-matching", async () => {
      const matcher = new DriveImageMatcherService(mockDriveService);
      const mediaList: any[] = [
        { url: "saree-blue-001", type: MediaType.IMAGE, order: 0 },
      ];

      // Admin explicitly selected file-3
      const confirmedAssignments = { "0": "file-3" };

      const res = await matcher.match("user-1", "folder-123", mediaList, confirmedAssignments);

      assert.equal(res.matched.length, 1);
      assert.equal(res.matched[0].file.id, "file-3");
      assert.equal(res.ambiguous.length, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Raw Text Parser Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("Raw Text Parser", () => {
    it("should parse raw JSON array into structured workbook rows", () => {
      const jsonText = JSON.stringify([
        {
          productGroupId: "PROD-RAW-1",
          name: "Raw Silk Saree",
          categoryPath: "Sarees > Pure Silk",
          basePrice: 5000,
          sellingPrice: 4500,
          sku: "RAW-001",
          description: "Handloom silk saree",
          media: [{ url: "raw-saree.jpg" }],
        },
      ]);

      const parsed = BulkProductParser.parseRawText(jsonText);

      assert.equal(parsed.products.length, 1);
      assert.equal(parsed.products[0].productGroupId, "PROD-RAW-1");
      assert.equal(parsed.products[0].name, "Raw Silk Saree");
      assert.equal(parsed.products[0].basePrice, 5000);
      assert.equal(parsed.products[0].sellingPrice, 4500);
      assert.equal(parsed.media.length, 1);
      assert.equal(parsed.media[0].url, "raw-saree.jpg");
    });

    it("should parse raw CSV text with headers into structured rows", () => {
      const csvText = [
        "Product Group ID,Name,Category Path,Base Price,Selling Price,SKU,Description,Images",
        'PROD-CSV-1,"Kanchipuram Silk",Sarees > Silk,8000,7500,KAN-01,"Pure Kanchipuram",kan-1.jpg;kan-2.jpg',
      ].join("\n");

      const parsed = BulkProductParser.parseRawText(csvText);

      assert.equal(parsed.products.length, 1);
      assert.equal(parsed.products[0].productGroupId, "PROD-CSV-1");
      assert.equal(parsed.products[0].name, "Kanchipuram Silk");
      assert.equal(parsed.products[0].basePrice, 8000);
      assert.equal(parsed.products[0].sellingPrice, 7500);
      assert.equal(parsed.media.length, 2);
      assert.equal(parsed.media[0].url, "kan-1.jpg");
      assert.equal(parsed.media[1].url, "kan-2.jpg");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Persistent Draft Service Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("BulkImportDraftService CRUD & Ownership", () => {
    let mockDrafts: Map<string, any>;
    let mockRepo: any;
    let mockMatcher: any;
    let mockBulkService: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockDrafts = new Map();
      let nextId = 1;

      mockRepo = {
        create: async (userId: bigint, dto: any) => {
          const id = String(nextId++);
          const record = {
            id,
            userId,
            rawInput: dto.rawInput,
            parsedData: dto.parsedData ?? null,
            imageMatches: dto.imageMatches ?? null,
            confirmedAssignments: dto.confirmedAssignments ?? null,
            status: "DRAFT",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockDrafts.set(id, record);
          return record;
        },
        findById: async (id: string) => mockDrafts.get(id) || null,
        findAllByUser: async (userId: bigint) =>
          [...mockDrafts.values()].filter((d) => d.userId === userId),
        update: async (id: string, data: any) => {
          const existing = mockDrafts.get(id);
          if (!existing) throw new Error("Not found");
          const updated = { ...existing, ...data, updatedAt: new Date() };
          mockDrafts.set(id, updated);
          return updated;
        },
        delete: async (id: string) => {
          mockDrafts.delete(id);
        },
      };

      mockMatcher = {
        match: async () => ({
          matched: [{ reference: "photo.jpg", file: { id: "f1", name: "photo.jpg", previewUrl: "/proxy/f1" }, mediaIndex: 0 }],
          missing: [],
          ambiguous: [],
          duplicates: [],
          folderFileCount: 1,
        }),
      };

      mockBulkService = {
        getCategoryHierarchy: async () => ({ flatList: [], tree: [] }),
        getWarehouseLookupList: async () => [],
      };

      mockPrisma = {
        product: {
          create: async () => {
            throw new Error("Draft operations must NEVER create products!");
          },
        },
        productVariant: {
          create: async () => {
            throw new Error("Draft operations must NEVER create variants!");
          },
        },
      };
    });

    it("should create persistent draft and allow reading by owner", async () => {
      const draftService = new BulkImportDraftService(
        mockRepo,
        mockMatcher,
        mockBulkService,
        {} as any,
        mockPrisma
      );

      const draft = await draftService.createDraft(BigInt(100), {
        rawInput: "Some raw product input",
      });

      assert.ok(draft.id);
      assert.equal(draft.userId, "100");
      assert.equal(draft.rawInput, "Some raw product input");

      const fetched = await draftService.getDraft(draft.id, BigInt(100));
      assert.equal(fetched.id, draft.id);
    });

    it("should reject reading or modifying draft by non-owner with 403 Forbidden", async () => {
      const draftService = new BulkImportDraftService(
        mockRepo,
        mockMatcher,
        mockBulkService,
        {} as any,
        mockPrisma
      );

      const draft = await draftService.createDraft(BigInt(100), {
        rawInput: "Owner draft",
      });

      // User 200 tries to read User 100's draft
      await assert.rejects(
        async () => {
          await draftService.getDraft(draft.id, BigInt(200));
        },
        (err: any) => err.statusCode === 403
      );

      // User 200 tries to delete User 100's draft
      await assert.rejects(
        async () => {
          await draftService.deleteDraft(draft.id, BigInt(200));
        },
        (err: any) => err.statusCode === 403
      );
    });

    it("should persist matching results in BulkImportDraft.imageMatches", async () => {
      const draftService = new BulkImportDraftService(
        mockRepo,
        mockMatcher,
        mockBulkService,
        {} as any,
        mockPrisma
      );

      const draft = await draftService.createDraft(BigInt(100), {
        rawInput: "mock input",
      });

      // Update draft with parsedData
      await draftService.updateDraft(draft.id, BigInt(100), {
        parsedData: {
          products: [
            {
              productGroupId: "P1",
              name: "Saree",
              media: [{ url: "photo.jpg" }],
            },
          ],
        },
      });

      const matchedDraft = await draftService.matchDrive(draft.id, BigInt(100), {
        folderId: "gdrive-folder-123",
        forceRematch: false,
      });

      assert.ok(matchedDraft.imageMatches);
      assert.equal(matchedDraft.imageMatches.matched.length, 1);
      assert.equal(matchedDraft.imageMatches.matched[0].file.id, "f1");

      // Verify persisted state in repository
      const inDb = await mockRepo.findById(draft.id);
      assert.ok(inDb.imageMatches);
      assert.equal(inDb.imageMatches.matched[0].file.id, "f1");
    });

    it("should create draft with parsedData, SEO fields, categoryId, stock and preserve them on reload", async () => {
      const draftService = new BulkImportDraftService(
        mockRepo,
        mockMatcher,
        mockBulkService,
        {} as any,
        mockPrisma
      );

      const complexProduct = {
        name: "Kanchipuram Silk Saree - Jade Green",
        productGroupId: "NAVO-001",
        productType: "simple",
        categoryId: "cat-123",
        categoryPath: "Sarees > Silk Sarees",
        description: "Pure Kanchipuram Silk saree in Jade Green.",
        basePrice: 54999,
        sellingPrice: 49999,
        weight: 0.8,
        metaTitle: "Jade Green Kanchipuram Silk Saree | Kankana Silks",
        metaDesc: "Shop a beautiful jade green Kanchipuram silk saree.",
        stock: {
          warehouseId: "wh-999",
          warehouseCode: "MAIN",
          quantity: 15,
          lowStockThreshold: 5,
        },
        variants: [],
        media: [
          {
            url: "photo-0.jpg",
            altText: "Front View",
            order: 0,
          },
          {
            url: "photo-1.jpg",
            altText: "Pallu Detail",
            order: 1,
          },
        ],
      };

      // Create draft directly with parsedData and empty rawInput
      const created = await draftService.createDraft(BigInt(100), {
        rawInput: "raw text",
        parsedData: {
          products: [complexProduct],
        },
      });

      assert.ok(created.id);
      assert.equal(created.rawInput, "raw text");
      assert.equal(created.parsedData.products.length, 1);
      const prod = created.parsedData.products[0];
      assert.equal(prod.name, "Kanchipuram Silk Saree - Jade Green");
      assert.equal(prod.categoryId, "cat-123");
      assert.equal(prod.metaTitle, "Jade Green Kanchipuram Silk Saree | Kankana Silks");
      assert.equal(prod.metaDesc, "Shop a beautiful jade green Kanchipuram silk saree.");
      assert.equal(prod.stock.warehouseId, "wh-999");
      assert.equal(prod.stock.quantity, 15);
      assert.equal(prod.media.length, 2);
      assert.equal(prod.media[0].order, 0);
      assert.equal(prod.media[1].order, 1);

      // Reload draft and ensure all fields survived
      const reloaded = await draftService.getDraft(created.id, BigInt(100));
      assert.equal(reloaded.rawInput, "raw text");
      assert.equal(reloaded.parsedData.products[0].categoryId, "cat-123");
      assert.equal(reloaded.parsedData.products[0].metaTitle, "Jade Green Kanchipuram Silk Saree | Kankana Silks");
      assert.equal(reloaded.parsedData.products[0].media[0].order, 0);
    });

    it("should update draft with reordered images using order field only and preserve sequential order", async () => {
      const draftService = new BulkImportDraftService(
        mockRepo,
        mockMatcher,
        mockBulkService,
        {} as any,
        mockPrisma
      );

      const created = await draftService.createDraft(BigInt(100), {
        rawInput: "test draft",
      });

      // Update draft by reversing the order of images
      const reorderedMedia = [
        { url: "photo-b.jpg", altText: "Detail", order: 0 },
        { url: "photo-a.jpg", altText: "Front", order: 1 },
      ];

      const updated = await draftService.updateDraft(created.id, BigInt(100), {
        parsedData: {
          products: [
            {
              productGroupId: "P1",
              name: "Reordered Saree",
              media: reorderedMedia,
            },
          ],
        },
      });

      const updatedProd = updated.parsedData.products[0];
      assert.equal(updatedProd.media[0].url, "photo-b.jpg");
      assert.equal(updatedProd.media[0].order, 0);
      assert.equal(updatedProd.media[1].url, "photo-a.jpg");
      assert.equal(updatedProd.media[1].order, 1);
      // Ensure no isPrimary field was added
      assert.equal((updatedProd.media[0] as any).isPrimary, undefined);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Background Import Job Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("BulkImportJobService Background Jobs", () => {
    it("should start a background job, track progress, and complete successfully", async () => {
      const mockBulkProductService: any = {
        importProducts: async (products: any[]) => ({
          total: products.length,
          successful: products.length,
          failed: 0,
          skipped: 0,
          results: products.map((p) => ({
            productGroupId: p.productGroupId,
            name: p.name,
            status: "success",
            productId: "prod-" + p.productGroupId,
          })),
        }),
      };

      const mockDraftRepo: any = {
        update: async () => {},
      };

      const jobService = new BulkImportJobService(mockBulkProductService, mockDraftRepo);

      const sampleProducts: any[] = [
        { productGroupId: "P-1", name: "Product 1" },
        { productGroupId: "P-2", name: "Product 2" },
      ];

      const job = await jobService.startJob({
        userId: "user-123",
        products: sampleProducts,
      });

      assert.ok(job.id);
      assert.equal(job.total, 2);

      // Wait a moment for background execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = await jobService.getJob(job.id, "user-123");
      assert.equal(status.status, "completed");
      assert.equal(status.progress, 100);
      assert.equal(status.successful, 2);
      assert.equal(status.failed, 0);
    });

    it("should allow retrying only failed products in a job", async () => {
      let failedOnce = false;
      const mockBulkProductService: any = {
        importProducts: async (products: any[]) => {
          const p = products[0];
          if (p.productGroupId === "P-FAIL" && !failedOnce) {
            failedOnce = true;
            return {
              total: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
              results: [{ productGroupId: p.productGroupId, name: p.name, status: "failed", error: "Duplicate SKU" }],
            };
          }
          return {
            total: 1,
            successful: 1,
            failed: 0,
            skipped: 0,
            results: [{ productGroupId: p.productGroupId, name: p.name, status: "success", productId: "new-p" }],
          };
        },
      };

      const mockDraftRepo: any = {
        update: async () => {},
      };

      const jobService = new BulkImportJobService(mockBulkProductService, mockDraftRepo);

      const job = await jobService.startJob({
        userId: "user-123",
        products: [
          { productGroupId: "P-OK", name: "OK Product" } as any,
          { productGroupId: "P-FAIL", name: "Failed Product" } as any,
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 60));

      const initialStatus = await jobService.getJob(job.id, "user-123");
      assert.equal(initialStatus.failed, 1);
      assert.equal(initialStatus.successful, 1);

      // Retry the failed job
      const retryJob = await jobService.retryJob(job.id, "user-123");
      assert.equal(retryJob.total, 1); // Only retrying the 1 failed item

      await new Promise((resolve) => setTimeout(resolve, 60));

      const retryStatus = await jobService.getJob(retryJob.id, "user-123");
      assert.equal(retryStatus.status, "completed");
      assert.equal(retryStatus.successful, 1);
      assert.equal(retryStatus.failed, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Drive JSON File Import Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("Drive JSON File Import", () => {
    it("should parse product JSON payload fetched from Drive into valid products and media", async () => {
      const sampleJson = JSON.stringify([
        {
          productGroupId: "DRIVE-001",
          name: "Saree from Drive",
          categoryId: "3",
          categoryPath: "Clothing > Sarees > Silk Sarees",
          basePrice: 5000,
          sellingPrice: 4500,
          description: "Imported directly from Drive JSON",
          weight: 0.8,
          length: 30,
          breadth: 20,
          height: 5,
          stock: { warehouseId: "101", quantity: 10 },
          media: [{ url: "https://cdn.example.com/saree.jpg", type: "IMAGE", order: 0 }],
        },
      ]);

      const mockDriveServiceForParse: any = {
        readFileAsText: async (_userId: string, fileId: string) => {
          assert.equal(fileId, "drive-file-abc123");
          return sampleJson;
        },
      };

      const fetchedText = await mockDriveServiceForParse.readFileAsText("user-1", "drive-file-abc123");
      const parsed = BulkProductParser.parseRawText(fetchedText);

      assert.equal(parsed.products.length, 1);
      assert.equal(parsed.products[0].productGroupId, "DRIVE-001");
      assert.equal(parsed.products[0].name, "Saree from Drive");
      assert.equal(parsed.products[0].basePrice, 5000);
      assert.equal(parsed.products[0].sellingPrice, 4500);
      assert.equal(parsed.media.length, 1);
      assert.equal(parsed.media[0].url, "https://cdn.example.com/saree.jpg");
    });

    it("should produce identical parsed output from Drive JSON as from local file JSON", () => {
      const productJson = JSON.stringify([
        {
          productGroupId: "PARITY-001",
          name: "Parity Test Saree",
          categoryPath: "Clothing > Sarees",
          basePrice: 3000,
          sellingPrice: 2800,
          description: "Same product, two sources",
          weight: 0.7,
          length: 25,
          breadth: 18,
          height: 4,
          stock: { warehouseId: "101", quantity: 5 },
        },
      ]);

      const fromLocal = BulkProductParser.parseRawText(productJson);
      const fromDrive = BulkProductParser.parseRawText(productJson);

      assert.deepStrictEqual(fromLocal, fromDrive);
    });

    it("should support variable products with variants in JSON import", () => {
      const variableProductJson = JSON.stringify([
        {
          productGroupId: "VAR-001",
          name: "Kanchipuram Silk Saree",
          categoryPath: "Clothing > Sarees > Silk Sarees",
          basePrice: 8000,
          sellingPrice: 7500,
          description: "Handcrafted pure silk",
          weight: 1.0,
          length: 40,
          breadth: 25,
          height: 6,
          variants: [
            {
              sku: "VAR-001-RED",
              title: "Red Kanchipuram",
              price: 7500,
              stock: { warehouseId: "101", quantity: 15 },
              attributes: [{ name: "Color", value: "Red" }],
            },
            {
              sku: "VAR-001-GREEN",
              title: "Green Kanchipuram",
              price: 7800,
              stock: { warehouseId: "101", quantity: 8 },
              attributes: [{ name: "Color", value: "Green" }],
            },
          ],
        },
      ]);

      const parsed = BulkProductParser.parseRawText(variableProductJson);
      assert.equal(parsed.products.length, 1);
      assert.equal(parsed.variants.length, 2);
      assert.equal(parsed.variants[0].sku, "VAR-001-RED");
      assert.equal(parsed.variants[1].sku, "VAR-001-GREEN");
      assert.equal(parsed.variants[0].attributes?.[0]?.value, "Red");
    });
  });
});
