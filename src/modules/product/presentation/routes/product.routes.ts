import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  authorize,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { UserRole } from "@/generated/prisma/enums.js";
import { ProductController } from "../controller/prodcut.controller.js";

const router = Router();

const getProductController = () => container.resolve(ProductController);

// ==========================================
// PUBLIC ROUTES
// ==========================================

router.get("/products", (req, res) =>
  getProductController().getProducts(req, res)
);

router.get("/products/:id", (req, res) =>
  getProductController().getProduct(req, res)
);

router.get("/products/slug/:slug", (req, res) =>
  getProductController().getProductBySlug(req, res)
);

router.get("/products/:id/stock", (req, res) =>
  getProductController().getProductStock(req, res)
);

// ==========================================
// ADMIN ROUTES - PRODUCTS
// ==========================================

router.post(
  "/products",
  authenticate,
  checkPermission("products", "create"),
  (req, res) => getProductController().createProduct(req, res)
);

router.put(
  "/products/:id",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateProduct(req, res)
);

router.delete(
  "/products/:id",
  authenticate,
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
  checkPermission("products", "update"),
  (req, res) => getProductController().updateSpecification(req, res)
);

router.delete(
  "/products/:id/specifications/:specId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteSpecification(req, res)
);

// ==========================================
// ADMIN ROUTES - PRODUCT MEDIA
// ==========================================

router.post(
  "/products/:id/media",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().addMedia(req, res)
);

router.delete(
  "/products/:id/media/:mediaId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteMedia(req, res)
);

// ==========================================
// ADMIN ROUTES - VARIANTS (ENHANCED)
// ==========================================

router.post(
  "/products/:id/variants",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().addVariant(req, res)
);

router.get(
  "/products/:id/variants/:variantId",
  authenticate,
  checkPermission("products", "read"),
  (req, res) => getProductController().getVariant(req, res)
);

router.put(
  "/products/:id/variants/:variantId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateVariant(req, res)
);

router.delete(
  "/products/:id/variants/:variantId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteVariant(req, res)
);

// ==========================================
// 🆕 ADMIN ROUTES - VARIANT MEDIA
// ==========================================

router.post(
  "/products/:id/variants/:variantId/media",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().addVariantMedia(req, res)
);

router.delete(
  "/products/:id/variants/:variantId/media/:mediaId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteVariantMedia(req, res)
);

// ==========================================
// ADMIN ROUTES - STOCK
// ==========================================

router.put(
  "/products/:id/stock",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateStock(req, res)
);

export default router;
