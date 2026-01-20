import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { ProductRequestController } from "../controller/product-request.controller.js";

const router = Router();

const getProductRequestController = () =>
  container.resolve(ProductRequestController);

// User routes
router.post("/product-requests", authenticate, (req, res) =>
  getProductRequestController().createRequest(req, res)
);

router.get("/product-requests/my-requests", authenticate, (req, res) =>
  getProductRequestController().getUserRequests(req, res)
);

router.get("/product-requests/:id", authenticate, (req, res) =>
  getProductRequestController().getRequest(req, res)
);

router.delete("/product-requests/:id", authenticate, (req, res) =>
  getProductRequestController().cancelRequest(req, res)
);

// Admin routes
router.get(
  "/admin/product-requests",
  authenticate,
  checkPermission("product-requests", "read"),
  (req, res) => getProductRequestController().getAllRequests(req, res)
);

router.patch(
  "/admin/product-requests/:id/approve",
  authenticate,
  checkPermission("product-requests", "update"),
  (req, res) => getProductRequestController().approveRequest(req, res)
);

router.patch(
  "/admin/product-requests/:id/reject",
  authenticate,
  checkPermission("product-requests", "update"),
  (req, res) => getProductRequestController().rejectRequest(req, res)
);

router.patch(
  "/admin/product-requests/:id/fulfill",
  authenticate,
  checkPermission("product-requests", "update"),
  (req, res) => getProductRequestController().fulfillRequest(req, res)
);

export default router;