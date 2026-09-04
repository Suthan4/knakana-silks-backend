import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { CouponService } from "../../application/service/coupon.service.js";
import { NotFoundError, ValidationError } from "@/shared/utils/errors.js";
import type {
  ApplyCouponDTO,
  CreateCouponDTO,
  GetApplicableCouponsDTO,
  QueryCouponDTO,
  UpdateCouponDTO,
  ValidateCouponDTO,
} from "../../application/dtos/coupon.dtos.js";

// NOTE: All request validation now happens in the route layer via
// validateBody(...) / validateQuery(...) (see coupon.routes.ts).
// req.body / req.query are already parsed + typed by the time they
// reach these handlers, so there's no need to call Schema.parse()
// here anymore. Any error that does occur is passed to next(error)
// so the shared errorHandler middleware formats the response
// consistently (and readably) across the whole API.

@injectable()
export class CouponController {
  constructor(@inject(CouponService) private couponService: CouponService) {}

  async createCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as CreateCouponDTO;
      const coupon = await this.couponService.createCoupon(data);

      res.status(201).json({
        success: true,
        message: "Coupon created successfully",
        data: coupon,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id || Array.isArray(id)) {
        throw new ValidationError("Coupon ID is required");
      }

      const data = req.body as UpdateCouponDTO;
      const coupon = await this.couponService.updateCoupon(id, data);

      res.json({
        success: true,
        message: "Coupon updated successfully",
        data: coupon,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id || Array.isArray(id)) {
        throw new ValidationError("Coupon ID is required");
      }

      await this.couponService.deleteCoupon(id);

      res.json({
        success: true,
        message: "Coupon deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id || Array.isArray(id)) {
        throw new ValidationError("Coupon ID is required");
      }

      const coupon = await this.couponService.getCoupon(id);
      if (!coupon) {
        throw new NotFoundError("Coupon not found");
      }

      res.json({
        success: true,
        data: coupon,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCoupons(req: Request, res: Response, next: NextFunction) {
    try {
      const params = req.query as unknown as QueryCouponDTO;
      const result = await this.couponService.getCoupons(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // 🆕 Validate Coupon (for client-side validation)
  async validateCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const { code, orderAmount, cartItems } = req.body as ValidateCouponDTO;

      const result = await this.couponService.validateCoupon(
        code,
        orderAmount,
        cartItems,
        userId
      );

      res.json({
        success: result.valid,
        message: result.valid
          ? "Coupon is valid"
          : "error" in result
          ? result.error
          : "Invalid coupon",
        data: result.valid ? result : undefined,
        error: result.valid
          ? undefined
          : "error" in result
          ? result.error
          : "Invalid coupon",
      });
    } catch (error) {
      next(error);
    }
  }

  // 🆕 Apply Coupon (for checkout)
  async applyCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const { code, orderAmount, cartItems } = req.body as ApplyCouponDTO;

      const result = await this.couponService.applyCoupon(
        code,
        orderAmount,
        cartItems,
        userId
      );

      res.json({
        success: true,
        message: "Coupon applied successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // 🆕 Get Applicable Coupons for Cart
  async getApplicableCoupons(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const { orderAmount, cartItems } = req.body as GetApplicableCouponsDTO;

      const coupons = await this.couponService.getApplicableCoupons(
        orderAmount,
        cartItems,
        userId
      );

      res.json({
        success: true,
        message: `Found ${coupons.length} applicable coupons`,
        data: coupons,
      });
    } catch (error) {
      next(error);
    }
  }

  async getActiveCoupons(req: Request, res: Response, next: NextFunction) {
    try {
      const coupons = await this.couponService.getActiveCoupons();

      res.json({
        success: true,
        data: coupons,
      });
    } catch (error) {
      next(error);
    }
  }
}