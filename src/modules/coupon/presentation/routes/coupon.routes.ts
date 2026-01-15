import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { CouponController } from "../controller/coupon.controller.js";

const router = Router();

const getCouponController = () => container.resolve(CouponController);

// 🆕 NEW: Public routes for coupon validation
router.get("/coupons/active", (req, res) =>
  getCouponController().getActiveCoupons(req, res)
);

router.post("/coupons/validate", authenticate, (req, res) =>
  getCouponController().validateCoupon(req, res)
);

router.post("/coupons/apply", authenticate, (req, res) =>
  getCouponController().applyCoupon(req, res)
);

router.post("/coupons/applicable", authenticate, (req, res) =>
  getCouponController().getApplicableCoupons(req, res)
);

// Admin routes
router.get(
  "/admin/coupons",
  authenticate,
  checkPermission("coupons", "read"),
  (req, res) => getCouponController().getCoupons(req, res)
);

router.get(
  "/admin/coupons/:id",
  authenticate,
  checkPermission("coupons", "read"),
  (req, res) => getCouponController().getCoupon(req, res)
);

router.post(
  "/admin/coupons",
  authenticate,
  checkPermission("coupons", "create"),
  (req, res) => getCouponController().createCoupon(req, res)
);

router.put(
  "/admin/coupons/:id",
  authenticate,
  checkPermission("coupons", "update"),
  (req, res) => getCouponController().updateCoupon(req, res)
);

router.delete(
  "/admin/coupons/:id",
  authenticate,
  checkPermission("coupons", "delete"),
  (req, res) => getCouponController().deleteCoupon(req, res)
);

export default router;