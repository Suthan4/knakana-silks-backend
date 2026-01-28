import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { OrderController } from "../controller/order.controller.js";
import { OrderAnalyticsController } from "../controller/order.anlaytics.controller.js";

const router = Router();

const getOrderController = () => container.resolve(OrderController);
const getOrderAnalyticsController = () => container.resolve(OrderAnalyticsController);

// ==================== USER ROUTES (Authenticated) ====================

/**
 * Get order preview (calculate totals without creating order)
 * POST /api/orders/preview
 * Body: { shippingAddressId, couponCode?, items? }
 */
router.post("/orders/preview", authenticate, (req, res) =>
  getOrderController().getOrderPreview(req, res)
);

/**
 * ✅ NEW: Initiate payment session (creates Razorpay order, NO DB order yet)
 * POST /api/orders/initiate-payment
 * Body: { shippingAddressId, billingAddressId, couponCode?, paymentMethod, items? }
 */
router.post("/orders/initiate-payment", authenticate, (req, res) =>
  getOrderController().initiatePayment(req, res)
);

/**
 * ✅ UPDATED: Verify payment AND create order in DB
 * POST /api/orders/verify-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post("/orders/verify-payment", authenticate, (req, res) =>
  getOrderController().verifyPayment(req, res)
);

/**
 * Get user's orders with pagination
 * GET /api/orders/my-orders
 * Query: page, limit, status, startDate, endDate, sortBy, sortOrder
 */
router.get("/orders/my-orders", authenticate, (req, res) =>
  getOrderController().getUserOrders(req, res)
);

/**
 * Get single order by ID
 * GET /api/orders/:id
 */
router.get("/orders/:id", authenticate, (req, res) =>
  getOrderController().getOrder(req, res)
);

/**
 * Get order by order number
 * GET /api/orders/number/:orderNumber
 */
router.get("/orders/number/:orderNumber", authenticate, (req, res) =>
  getOrderController().getOrderByNumber(req, res)
);

/**
 * Check if order can be cancelled
 * GET /api/orders/:id/can-cancel
 */
router.get("/orders/:id/can-cancel", authenticate, (req, res) =>
  getOrderController().canCancelOrder(req, res)
);

/**
 * Cancel order
 * POST /api/orders/:id/cancel
 * Body: { reason?: string }
 */
router.post("/orders/:id/cancel", authenticate, (req, res) =>
  getOrderController().cancelOrder(req, res)
);

/**
 * ✅ NEW: Download invoice PDF
 * GET /api/orders/:id/invoice
 */
router.get("/orders/:id/invoice", authenticate, (req, res) =>
  getOrderController().downloadInvoice(req, res)
);

// ==================== ADMIN ROUTES ====================

/**
 * Get all orders (Admin)
 * GET /api/admin/orders
 * Query: page, limit, status, startDate, endDate, sortBy, sortOrder
 */
router.get(
  "/admin/orders",
  authenticate,
  checkPermission("orders", "read"),
  (req, res) => getOrderController().getAllOrders(req, res)
);

/**
 * Update order status (Admin)
 * PUT /api/admin/orders/:id/status
 * Body: { status: OrderStatus }
 */
router.put(
  "/admin/orders/:id/status",
  authenticate,
  checkPermission("orders", "update"),
  (req, res) => getOrderController().updateOrderStatus(req, res)
);

// ==================== ANALYTICS ROUTES (Admin) ====================

/**
 * Get comprehensive order analytics
 * GET /api/admin/orders/analytics
 * Query: startDate?, endDate?
 */
router.get(
  "/admin/orders/analytics",
  authenticate,
  checkPermission("orders", "read"),
  (req, res) => getOrderAnalyticsController().getOrderAnalytics(req, res)
);

/**
 * Get order statistics summary
 * GET /api/admin/orders/stats
 */
router.get(
  "/admin/orders/stats",
  authenticate,
  checkPermission("orders", "read"),
  (req, res) => getOrderAnalyticsController().getOrderStats(req, res)
);

export default router;