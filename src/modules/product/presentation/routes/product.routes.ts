import { Router } from "express";
import { container } from "tsyringe";
import multer from "multer";
import {
  authenticate,
  authorize,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { UserRole } from "@/generated/prisma/enums.js";
import { ProductController } from "../controller/prodcut.controller.js";
import { BulkProductController } from "../controller/bulk-product.controller.js";
import { BulkImportDraftController } from "../controller/bulk-import-draft.controller.js";
import {
  adminCatalogReadLimiter,
  adminCatalogWriteLimiter,
  publicCatalogLimiter,
} from "@/shared/middleware/rate-limit.middleware.js";

const router = Router();

const getProductController = () => container.resolve(ProductController);
const getBulkProductController = () => container.resolve(BulkProductController);
const getDraftController = () => container.resolve(BulkImportDraftController);

// Configure Multer in-memory storage for bulk excel files (max 50MB)
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isExcel =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.originalname.toLowerCase().endsWith(".xlsx");
    if (isExcel) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx Excel files are supported"));
    }
  },
});

// ==========================================
// 🚀 ADMIN ROUTES - BULK PRODUCT IMPORT (MUST BE BEFORE /products/:id)
// ==========================================

router.get(
  "/products/bulk/categories-tree",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getBulkProductController().getCategoriesTree(req, res)
);

router.get(
  "/products/bulk/warehouses",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getBulkProductController().getWarehouses(req, res)
);

router.get(
  "/products/bulk/template",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getBulkProductController().downloadTemplate(req, res)
);

router.post(
  "/products/bulk/export",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getBulkProductController().exportProducts(req, res)
);

router.post(
  "/products/bulk/validate",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  uploadExcel.single("file"),
  (req, res) => getBulkProductController().validateBulk(req, res)
);

router.post(
  "/products/bulk/import",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  uploadExcel.single("file"),
  (req, res) => getBulkProductController().importBulk(req, res)
);

// ==========================================
// 🆕 ADMIN ROUTES - BULK IMPORT DRAFTS
// ==========================================

router.post(
  "/products/bulk/draft",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().createDraft(req, res)
);

router.get(
  "/products/bulk/draft",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().listDrafts(req, res)
);

router.get(
  "/products/bulk/draft/:id",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().getDraft(req, res)
);

router.patch(
  "/products/bulk/draft/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().updateDraft(req, res)
);

router.delete(
  "/products/bulk/draft/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().deleteDraft(req, res)
);

router.post(
  "/products/bulk/draft/:id/parse",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  uploadExcel.single("file"),
  (req, res) => getDraftController().parseDraft(req, res)
);

router.post(
  "/products/bulk/draft/:id/parse-drive",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().parseDriveFile(req, res)
);

router.post(
  "/products/bulk/draft/:id/match-drive",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().matchDrive(req, res)
);

router.post(
  "/products/bulk/draft/:id/import",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().startDraftImport(req, res)
);

// Background import jobs
router.post(
  "/products/bulk/import-job",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().startImportJob(req, res)
);

router.get(
  "/products/bulk/job/:jobId",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().getJobStatus(req, res)
);

router.post(
  "/products/bulk/job/:jobId/retry",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().retryJob(req, res)
);

// Drive folder list
router.get(
  "/products/bulk/drive/folders",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().listDriveFolders(req, res)
);

// Drive JSON file list (for product import)
router.get(
  "/products/bulk/drive/json-files",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "create"),
  (req, res) => getDraftController().listDriveJsonFiles(req, res)
);

// Lightweight Drive thumbnail proxy; does not stream full-size originals.
router.get(
  "/products/bulk/drive-thumbnail/:fileId",
  authenticate,
  (req, res) => getDraftController().driveThumbnail(req, res)
);

// Drive proxy – streams original file only when explicitly requested.
router.get(
  "/products/bulk/drive-proxy/:fileId",
  authenticate,
  (req, res) => getDraftController().driveProxy(req, res)
);

// ==========================================
// PUBLIC ROUTES
// ==========================================

router.get("/products", publicCatalogLimiter, (req, res) =>
  getProductController().getProducts(req, res)
);

router.get("/products/:id", publicCatalogLimiter, (req, res) =>
  getProductController().getProduct(req, res)
);

router.get("/products/slug/:slug", publicCatalogLimiter, (req, res) =>
  getProductController().getProductBySlug(req, res)
);

router.get("/products/:id/stock", publicCatalogLimiter, (req, res) =>
  getProductController().getProductStock(req, res)
);

// ==========================================
// ADMIN ROUTES - PRODUCTS
// ==========================================

router.post(
  "/products",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "create"),
  (req, res) => getProductController().createProduct(req, res)
);

router.get(
  "/admin/products",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "read"),
  (req, res) => getProductController().getAdminProducts(req, res)
);

router.put(
  "/products/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateProduct(req, res)
);

router.patch(
  "/products/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().patchProduct(req, res)
);

router.delete(
  "/products/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "delete"),
  (req, res) => getProductController().deleteProduct(req, res)
);

// ==========================================
// ADMIN ROUTES - SPECIFICATIONS
// ==========================================

router.post(
  "/products/:id/specifications",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().addSpecification(req, res)
);

router.put(
  "/products/:id/specifications/:specId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateSpecification(req, res)
);

router.delete(
  "/products/:id/specifications/:specId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteSpecification(req, res)
);

// ==========================================
// ADMIN ROUTES - PRODUCT MEDIA
// ==========================================

router.post(
  "/products/:id/media",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().addMedia(req, res)
);

router.delete(
  "/products/:id/media/:mediaId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteMedia(req, res)
);

// ==========================================
// ADMIN ROUTES - VARIANTS (ENHANCED)
// ==========================================

router.post(
  "/products/:id/variants",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().addVariant(req, res)
);

router.get(
  "/products/:id/variants/:variantId",
  authenticate,
  adminCatalogReadLimiter,
  checkPermission("products", "read"),
  (req, res) => getProductController().getVariant(req, res)
);

router.put(
  "/products/:id/variants/:variantId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateVariant(req, res)
);

router.delete(
  "/products/:id/variants/:variantId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteVariant(req, res)
);

// ==========================================
// 🆕 ADMIN ROUTES - VARIANT MEDIA
// ==========================================

router.post(
  "/products/:id/variants/:variantId/media",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().addVariantMedia(req, res)
);

router.delete(
  "/products/:id/variants/:variantId/media/:mediaId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteVariantMedia(req, res)
);

// ==========================================
// ADMIN ROUTES - STOCK
// ==========================================

router.put(
  "/products/:id/stock",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateStock(req, res)
);

export default router;
