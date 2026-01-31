// src/modules/stock/presentation/routes/stock.routes.ts
import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { StockController } from "../controller/stock.controller.js";

const router = Router();

const getStockController = () => container.resolve(StockController);

// ==================== PUBLIC/USER ROUTES ====================

/**
 * Check stock availability
 * POST /api/stock/check-availability
 * Body: { productId, variantId?, warehouseId, requiredQuantity }
 */
router.post("/stock/check-availability", (req, res) =>
  getStockController().checkStockAvailability(req, res)
);

// ==================== ADMIN ROUTES ====================

/**
 * Get low stock alerts
 * GET /api/admin/stock/low-stock-alerts
 */
router.get(
  "/admin/stock/low-stock-alerts",
  authenticate,
  checkPermission("stock", "read"),
  (req, res) => getStockController().getLowStockAlerts(req, res)
);

/**
 * Get stock history for a product
 * GET /api/admin/stock/history/:productId
 * Query: variantId?, warehouseId?
 */
router.get(
  "/admin/stock/history/:productId",
  authenticate,
  checkPermission("stock", "read"),
  (req, res) => getStockController().getStockHistory(req, res)
);

/**
 * Manual stock adjustment
 * POST /api/admin/stock/adjust
 * Body: { productId, variantId?, warehouseId, quantity, reason, notes? }
 */
router.post(
  "/admin/stock/adjust",
  authenticate,
  checkPermission("stock", "update"),
  (req, res) => getStockController().manualStockAdjustment(req, res)
);

export default router;