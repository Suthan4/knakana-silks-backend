import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { ShippingCalculatorService } from "../../application/service/shipping.calculator.service.js";

const CartShippingRequestSchema = z.object({
  deliveryPincode: z.string().regex(/^[1-9][0-9]{5}$/),
  cartItems: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
});

const ServiceabilityCheckSchema = z.object({
  pickupPincode: z.string().regex(/^[1-9][0-9]{5}$/),
  deliveryPincode: z.string().regex(/^[1-9][0-9]{5}$/),
});

const ShippingRateRequestSchema = z.object({
  deliveryPincode: z.string().regex(/^[1-9][0-9]{5}$/),
  cod: z.boolean().optional(),
  weight: z.number().positive().optional(),
});


@injectable()
export class ShippingCalculatorController {
  constructor(
    @inject(ShippingCalculatorService)
    private shippingCalculatorService: ShippingCalculatorService
  ) {}

  /**
   * Get shipping rates for cart
   * POST /api/shipping/cart-rates
   */
  async getCartShippingRates(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      const data = CartShippingRequestSchema.parse(req.body);

      const result = await this.shippingCalculatorService.calculateCartShipping(
        userId,
        data.deliveryPincode,
        data.cartItems
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Cart shipping calculation error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to calculate shipping",
      });
    }
  }

  /**
   * Check pincode serviceability (public)
   * POST /api/shipping/check-serviceability
   */
  async checkServiceability(req: Request, res: Response) {
    try {
      const data = ServiceabilityCheckSchema.parse(req.body);

      const result =
        await this.shippingCalculatorService.checkPincodeServiceability(
          data.pickupPincode,
          data.deliveryPincode
        );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Serviceability check error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to check serviceability",
      });
    }
  }

  /**
 * Get shipping rates by pincode (public)
 * POST /api/shipping/rates
 */
async getShippingRates(req: Request, res: Response) {
  try {
    const data = ShippingRateRequestSchema.parse(req.body);

    const result =
      await this.shippingCalculatorService.getShippingRatesByPincode({
        deliveryPincode: data.deliveryPincode,
        cod: data.cod,
        weight: data.weight,
      });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Shipping rates error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch shipping rates",
    });
  }
}

}