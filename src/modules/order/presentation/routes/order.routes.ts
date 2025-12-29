import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { OrderController } from "../controller/order.controller.js";

const router = Router();

const getOrderController = () => container.resolve(OrderController);

// User routes (authenticated)
router.post("/orders", authenticate, (req, res) =>
  getOrderController().createOrder(req, res)
);

router.post("/orders/verify-payment", authenticate, (req, res) =>
  getOrderController().verifyPayment(req, res)
);

router.get("/orders/my-orders", authenticate, (req, res) =>
  getOrderController().getUserOrders(req, res)
);

router.get("/orders/:id", authenticate, (req, res) =>
  getOrderController().getOrder(req, res)
);

router.get("/orders/number/:orderNumber", authenticate, (req, res) =>
  getOrderController().getOrderByNumber(req, res)
);

// Check if order can be cancelled (for UI logic)
router.get("/orders/:id/can-cancel", authenticate, (req, res) =>
  getOrderController().canCancelOrder(req, res)
);

// Cancel order
router.post("/orders/:id/cancel", authenticate, (req, res) =>
  getOrderController().cancelOrder(req, res)
);

// Admin routes
router.get(
  "/admin/orders",
  authenticate,
  checkPermission("orders", "read"),
  (req, res) => getOrderController().getAllOrders(req, res)
);

router.put(
  "/admin/orders/:id/status",
  authenticate,
  checkPermission("orders", "update"),
  (req, res) => getOrderController().updateOrderStatus(req, res)
);

export default router;
