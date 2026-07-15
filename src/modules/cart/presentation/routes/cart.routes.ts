import { Router } from "express";
import { container } from "tsyringe";
import { authenticate } from "@/shared/middleware/auth.middleware.js";
import { CartController } from "../controller/cart.controller.js";
import { commerceReadLimiter, commerceWriteLimiter } from "@/shared/middleware/rate-limit.middleware.js";

const router = Router();

const getCartController = () => container.resolve(CartController);

// All cart routes require authentication
router.get("/cart", authenticate,commerceReadLimiter, (req, res) =>
  getCartController().getCart(req, res)
);

router.get("/cart/count", authenticate,commerceReadLimiter, (req, res) =>
  getCartController().getItemCount(req, res)
);

router.post("/cart/items", authenticate,commerceWriteLimiter, (req, res) =>
  getCartController().addToCart(req, res)
);

router.put("/cart/items/:itemId", authenticate,commerceWriteLimiter, (req, res) =>
  getCartController().updateCartItem(req, res)
);

router.delete("/cart/items/:itemId", authenticate,commerceWriteLimiter, (req, res) =>
  getCartController().removeFromCart(req, res)
);

router.delete("/cart", authenticate,commerceWriteLimiter, (req, res) =>
  getCartController().clearCart(req, res)
);

export default router;
