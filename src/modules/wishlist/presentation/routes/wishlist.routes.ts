import { Router } from "express";
import { container } from "tsyringe";
import { authenticate } from "@/shared/middleware/auth.middleware.js";
import { WishlistController } from "../controller/wishlist.controller.js";

const router = Router();

const getWishlistController = () => container.resolve(WishlistController);

// All wishlist routes require authentication
router.get("/wishlist", authenticate, (req, res) =>
  getWishlistController().getWishlist(req, res)
);

router.post("/wishlist/items", authenticate, (req, res) =>
  getWishlistController().addToWishlist(req, res)
);

router.delete("/wishlist/items/:itemId", authenticate, (req, res) =>
  getWishlistController().removeFromWishlist(req, res)
);

router.delete("/wishlist", authenticate, (req, res) =>
  getWishlistController().clearWishlist(req, res)
);

router.put("/wishlist/visibility", authenticate, (req, res) =>
  getWishlistController().updateVisibility(req, res)
);

router.get("/wishlist/check/:productId", authenticate, (req, res) =>
  getWishlistController().checkProduct(req, res)
);

export default router;
