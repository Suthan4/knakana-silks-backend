import { Router } from "express";
import { container } from "tsyringe";
import { authenticate } from "@/shared/middleware/auth.middleware.js";
import { ShippingCalculatorController } from "../controller/shipping.calculator.controller.js";

const router = Router();

const getShippingController = () =>
  container.resolve(ShippingCalculatorController);

/**
 * Get shipping rates for cart (requires authentication)
 * POST /api/shipping/cart-rates
 * Body: { deliveryPincode: string, cartItems?: Array<{productId, variantId?, quantity}> }
 */
router.post("/shipping/cart-rates", authenticate, (req, res) =>
  getShippingController().getCartShippingRates(req, res)
);

/**
 * Check pincode serviceability (public)
 * POST /api/shipping/check-serviceability
 * Body: { pickupPincode: string, deliveryPincode: string }
 */
router.post("/shipments/check-serviceability", (req, res) =>
  getShippingController().checkServiceability(req, res)
);

/**
 * Get shipping rates by pincode (public)
 * POST /api/shipping/rates
 * Body: { deliveryPincode: string, cod?: boolean, weight?: number }
 */
router.post("/shipping/rates", (req, res) =>
  getShippingController().getShippingRates(req, res)
);


export default router;