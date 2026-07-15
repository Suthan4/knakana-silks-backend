import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  authorize,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { UserRole } from "@/generated/prisma/enums.js";
import { CategoryController } from "../controller/category.controller.js";
import { adminCatalogReadLimiter, adminCatalogWriteLimiter, publicCatalogLimiter } from "@/shared/middleware/rate-limit.middleware.js";

const router = Router();

const getCategoryController = () => container.resolve(CategoryController);

// Public routes
router.get("/categories",publicCatalogLimiter, (req, res) =>
  getCategoryController().getCategories(req, res)
);

router.get("/categories/tree", publicCatalogLimiter, (req, res) =>
  getCategoryController().getRootCategories(req, res)
);

router.get("/categories/tree/:id", publicCatalogLimiter, (req, res) =>
  getCategoryController().getCategoryTree(req, res)
);

router.get("/categories/:id", publicCatalogLimiter, (req, res) =>
  getCategoryController().getCategory(req, res)
);

router.get("/categories/slug/:slug", publicCatalogLimiter, (req, res) =>
  getCategoryController().getCategoryBySlug(req, res)
);

// Admin routes
router.post(
  "/categories",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("categories", "create"),
  (req, res) => getCategoryController().createCategory(req, res)
);

router.put(
  "/categories/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("categories", "update"),
  (req, res) => getCategoryController().updateCategory(req, res)
);

router.delete(
  "/categories/:id",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("categories", "delete"),
  (req, res) => getCategoryController().deleteCategory(req, res)
);

// Admin routes — placement management ("link existing category" feature)
router.post("/categories/link", authenticate, adminCatalogWriteLimiter, checkPermission("categories", "create"), (req, res) =>
  getCategoryController().linkCategory(req, res)
);
router.delete(
  "/categories/placements/:placementId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("categories", "delete"),
  (req, res) => getCategoryController().unlinkCategory(req, res)
);
router.put(
  "/categories/placements/:placementId",
  authenticate,
  adminCatalogWriteLimiter,
  checkPermission("categories", "update"),
  (req, res) => getCategoryController().updatePlacementOrder(req, res)
);

export default router;
