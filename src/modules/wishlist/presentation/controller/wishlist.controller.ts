import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { WishlistService } from "../../application/service/wishlist.service.js";
import {
  AddToWishlistDTOSchema,
  UpdateWishlistDTOSchema,
} from "../../application/dtos/wishlist.dto.js";

@injectable()
export class WishlistController {
  constructor(@inject(WishlistService) private wishlistService: WishlistService) {}

  async getWishlist(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const wishlist = await this.wishlistService.getWishlist(userId);

      res.json({
        success: true,
        data: wishlist,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async addToWishlist(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = AddToWishlistDTOSchema.parse(req.body);

      const item = await this.wishlistService.addToWishlist(
        userId,
        data.productId
      );

      res.status(201).json({
        success: true,
        message: "Item added to wishlist",
        data: item,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async removeFromWishlist(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { itemId } = req.params;

      if (!itemId) {
        res
          .status(400)
          .json({ success: false, message: "Item ID is required" });
        return;
      }

      await this.wishlistService.removeFromWishlist(userId, itemId);

      res.json({
        success: true,
        message: "Item removed from wishlist",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async clearWishlist(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      await this.wishlistService.clearWishlist(userId);

      res.json({
        success: true,
        message: "Wishlist cleared",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateVisibility(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = UpdateWishlistDTOSchema.parse(req.body);

      const wishlist = await this.wishlistService.updateVisibility(
        userId,
        data.isPublic
      );

      res.json({
        success: true,
        message: "Wishlist visibility updated",
        data: wishlist,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async checkProduct(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { productId } = req.params;

      if (!productId) {
        res
          .status(400)
          .json({ success: false, message: "productId is required" });
        return;
      }
      const isInWishlist = await this.wishlistService.isInWishlist(
        userId,
        productId
      );

      res.json({
        success: true,
        data: { isInWishlist },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
