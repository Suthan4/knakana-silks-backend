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
 * ✅ Check return eligibility
 * GET /api/returns/eligibility/:orderId
 * Used by frontend to determine if return button should be shown
 */
router.get("/returns/eligibility/:orderId", authenticate, (req, res) =>
  getReturnController().checkReturnEligibility(req, res)
);

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
 * ✅ Approve return
 * POST /api/admin/returns/:id/approve
 */
router.post(
  "/admin/returns/:id/approve",
  authenticate,
  checkPermission("returns", "update"),
  (req, res) => getReturnController().approveReturn(req, res)
);

/**
 * ✅ Reject return
 * POST /api/admin/returns/:id/reject
 */
router.post(
  "/admin/returns/:id/reject",
  authenticate,
  checkPermission("returns", "update"),
  (req, res) => getReturnController().rejectReturn(req, res)
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

export default router;