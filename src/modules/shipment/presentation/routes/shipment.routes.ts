import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { ShipmentController } from "../controller/shipment.controller.js";

const router = Router();

const getShipmentController = () => container.resolve(ShipmentController);

// ==================== PUBLIC ROUTES ====================

/**
 * Check pincode serviceability
 * POST /api/shipments/check-serviceability
 */
router.post("/shipments/check-serviceability", (req, res) =>
  getShipmentController().checkServiceability(req, res)
);

/**
 * Track shipment by tracking number
 * GET /api/shipments/track/:trackingNumber
 */
router.get("/shipments/track/:trackingNumber", (req, res) =>
  getShipmentController().trackByTrackingNumber(req, res)
);

// ==================== USER ROUTES (Authenticated) ====================

/**
 * Get shipment details for order
 * GET /api/shipments/order/:orderId
 */
router.get("/shipments/order/:orderId", authenticate, (req, res) =>
  getShipmentController().getShipmentByOrderId(req, res)
);

/**
 * Track shipment by order ID
 * GET /api/shipments/order/:orderId/track
 */
router.get("/shipments/order/:orderId/track", authenticate, (req, res) =>
  getShipmentController().trackShipment(req, res)
);

// ==================== ADMIN ROUTES ====================

/**
 * Create shipment in Shiprocket
 * POST /api/admin/shipments/create
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/create",
  authenticate,
  checkPermission("shipments", "create"),
  (req, res) => getShipmentController().createShipment(req, res)
);

/**
 * Get available couriers for order
 * GET /api/admin/shipments/couriers/:orderId
 */
router.get(
  "/admin/shipments/couriers/:orderId",
  authenticate,
  checkPermission("shipments", "read"),
  (req, res) => getShipmentController().getAvailableCouriers(req, res)
);

/**
 * Assign courier and generate AWB
 * POST /api/admin/shipments/assign-courier
 * Body: { orderId: string, courierId: number }
 */
router.post(
  "/admin/shipments/generateawb&assign-courier",
  authenticate,
  checkPermission("shipments", "update"),
  (req, res) => getShipmentController().assignCourier(req, res)
);


/**
 * Schedule pickup with courier
 * POST /api/admin/shipments/schedule-pickup
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/schedule-pickup",
  authenticate,
  checkPermission("shipments", "update"),
  (req, res) => getShipmentController().schedulePickup(req, res)
);

/**
 * Generate shipping label
 * POST /api/admin/shipments/generate-label
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/generate-label",
  authenticate,
  checkPermission("shipments", "create"),
  (req, res) => getShipmentController().generateLabel(req, res)
);

/**
 * Generate manifest
 * POST /api/admin/shipments/generate-manifest
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/generate-manifest",
  authenticate,
  checkPermission("shipments", "create"),
  (req, res) => getShipmentController().generateManifest(req, res)
);

/**
 * Mark order as delivered
 * POST /api/admin/shipments/mark-delivered
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/mark-delivered",
  authenticate,
  checkPermission("shipments", "update"),
  (req, res) => getShipmentController().markAsDelivered(req, res)
);

/**
 * Get Shiprocket order details
 * GET /api/admin/shipments/shiprocket/:orderId
 */
router.get(
  "/admin/shipments/shiprocket/:orderId",
  authenticate,
  checkPermission("shipments", "read"),
  (req, res) => getShipmentController().getShiprocketOrderDetails(req, res)
);

/**
 * Create return order
 * POST /api/admin/shipments/return
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/return",
  authenticate,
  checkPermission("shipments", "create"),
  (req, res) => getShipmentController().createReturnOrder(req, res)
);

/**
 * Cancel shipment in Shiprocket
 * POST /api/admin/shipments/cancel
 * Body: { orderId: string }
 */
router.post(
  "/admin/shipments/cancel",
  authenticate,
  checkPermission("shipments", "delete"),
  (req, res) => getShipmentController().cancelShipment(req, res)
);

export default router;
