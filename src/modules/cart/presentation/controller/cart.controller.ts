import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { CartService } from "../../application/service/cart.service.js";
import { AddToCartDTOSchema, UpdateCartItemDTOSchema } from "../../application/dtos/cart.dto.js";


@injectable()
export class CartController {
  constructor(@inject(CartService) private cartService: CartService) {}

  async getCart(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const cart = await this.cartService.getCart(userId);

      res.json({
        success: true,
        data: cart,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async addToCart(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = AddToCartDTOSchema.parse(req.body);

      const item = await this.cartService.addToCart(
        userId,
        data.productId,
        data.variantId,
        data.quantity
      );

      res.status(201).json({
        success: true,
        message: "Item added to cart",
        data: item,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateCartItem(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { itemId } = req.params;
      
      if (!itemId) {
        res.status(400).json({ success: false, message: "Item ID is required" });
        return;
      }
      
      const data = UpdateCartItemDTOSchema.parse(req.body);

      const item = await this.cartService.updateCartItem(
        userId,
        itemId,
        data.quantity
      );

      res.json({
        success: true,
        message: "Cart item updated",
        data: item,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async removeFromCart(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { itemId } = req.params;

      if (!itemId) {
        res.status(400).json({ success: false, message: "Item ID is required" });
        return;
      }

      await this.cartService.removeFromCart(userId, itemId);

      res.json({
        success: true,
        message: "Item removed from cart",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async clearCart(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      await this.cartService.clearCart(userId);

      res.json({
        success: true,
        message: "Cart cleared",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getItemCount(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const count = await this.cartService.getItemCount(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
