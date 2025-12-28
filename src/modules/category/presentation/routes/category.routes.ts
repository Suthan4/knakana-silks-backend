import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  authorize,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { UserRole } from "@/generated/prisma/enums.js";
import { CategoryController } from "../controller/category.controller.js";

const router = Router();

const getCategoryController = () => container.resolve(CategoryController);

// Public routes
router.get("/categories", (req, res) =>
  getCategoryController().getCategories(req, res)
);

router.get("/categories/tree", (req, res) =>
  getCategoryController().getRootCategories(req, res)
);

router.get("/categories/tree/:id", (req, res) =>
  getCategoryController().getCategoryTree(req, res)
);

router.get("/categories/:id", (req, res) =>
  getCategoryController().getCategory(req, res)
);

router.get("/categories/slug/:slug", (req, res) =>
  getCategoryController().getCategoryBySlug(req, res)
);

// Admin routes
router.post(
  "/categories",
  authenticate,
  checkPermission("categories", "create"),
  (req, res) => getCategoryController().createCategory(req, res)
);

router.put(
  "/categories/:id",
  authenticate,
  checkPermission("categories", "update"),
  (req, res) => getCategoryController().updateCategory(req, res)
);

router.delete(
  "/categories/:id",
  authenticate,
  checkPermission("categories", "delete"),
  (req, res) => getCategoryController().deleteCategory(req, res)
);

export default router;
