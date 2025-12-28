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

// Public routes
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
  getProductController().getStock(req, res)
);

// Admin routes - Products
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

// Admin routes - Specifications
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

// Admin routes - Images
router.post(
  "/products/:id/images",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().addImage(req, res)
);

router.delete(
  "/products/:id/images/:imageId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteImage(req, res)
);

// Admin routes - Variants
router.post(
  "/products/:id/variants",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().addVariant(req, res)
);

router.delete(
  "/products/:id/variants/:variantId",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().deleteVariant(req, res)
);

// Admin routes - Stock
router.put(
  "/products/:id/stock",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => getProductController().updateStock(req, res)
);

export default router;
