// coupon.routes.ts
import { Router } from "express";
import { container } from "tsyringe";
import { validateBody, validateQuery } from "@/shared/middleware/validation.middleware.js";
import {
  CreateCouponDTOSchema,
  UpdateCouponDTOSchema,
  QueryCouponDTOSchema,
  ValidateCouponDTOSchema,
  ApplyCouponDTOSchema,
  GetApplicableCouponsDTOSchema,
} from "../../application/dtos/coupon.dtos.js";
import { CouponController } from "../controller/coupon.controller.js";
import { authenticate, checkPermission } from "@/shared/middleware/auth.middleware.js";

const router = Router();

const getCouponController = () => container.resolve(CouponController);

router.post(
  "/admin/coupons",
  authenticate,
  checkPermission("coupons", "create"),
  validateBody(CreateCouponDTOSchema),
  (req, res, next) => getCouponController().createCoupon(req, res, next)
);

router.put(
  "/admin/coupons/:id",
  authenticate,
  checkPermission("coupons", "update"),
  validateBody(UpdateCouponDTOSchema),
  (req, res, next) => getCouponController().updateCoupon(req, res, next)
);

router.get(
  "/admin/coupons",
  authenticate,
  checkPermission("coupons", "read"),
  validateQuery(QueryCouponDTOSchema),
  (req, res, next) => getCouponController().getCoupons(req, res, next)
);

router.post(
  "/coupons/validate",
  authenticate,
  validateBody(ValidateCouponDTOSchema),
  (req, res, next) => getCouponController().validateCoupon(req, res, next)
);

router.post(
  "/coupons/apply",
  authenticate,
  validateBody(ApplyCouponDTOSchema),
  (req, res, next) => getCouponController().applyCoupon(req, res, next)
);

router.post(
  "/coupons/applicable",
  authenticate,
  validateBody(GetApplicableCouponsDTOSchema),
  (req, res, next) => getCouponController().getApplicableCoupons(req, res, next)
);

export default router;