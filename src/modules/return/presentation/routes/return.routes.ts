import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { ReturnController } from "../controller/return.controller.js";

const router = Router();

const getReturnController = () => container.resolve(ReturnController);

// ==================== USER ROUTES (Authenticated) ====================

/**
 * Create return request
 * POST /api/returns
 */
router.post("/returns", authenticate, (req, res) =>
  getReturnController().createReturn(req, res)
);

/**
 * Get user's returns
 * GET /api/returns/my-returns
 */
router.get("/returns/my-returns", authenticate, (req, res) =>
  getReturnController().getUserReturns(req, res)
);

/**
 * Get return by ID
 * GET /api/returns/:id
 */
router.get("/returns/:id", authenticate, (req, res) =>
  getReturnController().getReturn(req, res)
);

/**
 * Track return shipment
 * GET /api/returns/:id/track
 */
router.get("/returns/:id/track", authenticate, (req, res) =>
  getReturnController().trackReturnShipment(req, res)
);

// ==================== ADMIN ROUTES ====================

/**
 * Get all returns
 * GET /api/admin/returns
 */
router.get(
  "/admin/returns",
  authenticate,
  checkPermission("returns", "read"),
  (req, res) => getReturnController().getAllReturns(req, res)
);

/**
 * Update return status
 * PUT /api/admin/returns/:id/status
 */
router.put(
  "/admin/returns/:id/status",
  authenticate,
  checkPermission("returns", "update"),
  (req, res) => getReturnController().updateReturnStatus(req, res)
);

/**
 * Schedule return pickup
 * POST /api/admin/returns/schedule-pickup
 */
router.post(
  "/admin/returns/schedule-pickup",
  authenticate,
  checkPermission("returns", "update"),
  (req, res) => getReturnController().scheduleReturnPickup(req, res)
);

/**
 * Process refund
 * POST /api/admin/returns/:id/process-refund
 */
router.post(
  "/admin/returns/:id/process-refund",
  authenticate,
  checkPermission("returns", "update"),
  (req, res) => getReturnController().processRefund(req, res)
);

/**
 * Complete return
 * POST /api/admin/returns/:id/complete
 */
router.post(
  "/admin/returns/:id/complete",
  authenticate,
  checkPermission("returns", "update"),
  (req, res) => getReturnController().completeReturn(req, res)
);

export default router;
