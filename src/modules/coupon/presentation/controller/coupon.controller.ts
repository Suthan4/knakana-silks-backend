import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { CouponService } from "../../application/service/coupon.service.js";
import { ApplyCouponDTOSchema, CreateCouponDTOSchema, QueryCouponDTOSchema, UpdateCouponDTOSchema, } from "../../application/dtos/coupon.dtos.js";

@injectable()
export class CouponController {
  constructor(@inject(CouponService) private couponService: CouponService) {}

  async createCoupon(req: Request, res: Response) {
    try {
      const data = CreateCouponDTOSchema.parse(req.body);
      const coupon = await this.couponService.createCoupon(data);

      res.status(201).json({
        success: true,
        message: "Coupon created successfully",
        data: coupon,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Coupon ID is required" });
        return;
      }
      const data = UpdateCouponDTOSchema.parse(req.body);
      const coupon = await this.couponService.updateCoupon(id, data);

      res.json({
        success: true,
        message: "Coupon updated successfully",
        data: coupon,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Coupon ID is required" });
        return;
      }
      await this.couponService.deleteCoupon(id);

      res.json({
        success: true,
        message: "Coupon deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Coupon ID is required" });
        return;
      }
      const coupon = await this.couponService.getCoupon(id);

      res.json({
        success: true,
        data: coupon,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getCoupons(req: Request, res: Response) {
    try {
      const params = QueryCouponDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
            ? false
            : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.couponService.getCoupons(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async applyCoupon(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      const data = ApplyCouponDTOSchema.parse(req.body);

      const result = await this.couponService.applyCoupon(
        data.code,
        data.orderAmount,
        userId
      );

      res.json({
        success: true,
        message: "Coupon applied successfully",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getActiveCoupons(req: Request, res: Response) {
    try {
      const coupons = await this.couponService.getActiveCoupons();

      res.json({
        success: true,
        data: coupons,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
