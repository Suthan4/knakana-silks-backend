import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { OrderService } from "../../application/service/order.service.js";
import { z } from "zod";
import {
  UpdateOrderStatusDTOSchema,
  VerifyPaymentDTOSchema,
} from "../../application/dtos/order.dtos.js";

const CancelOrderDTOSchema = z.object({
  reason: z.string().optional(),
});

const OrderPreviewDTOSchema = z.object({
  shippingAddressId: z.string().min(1, "Shipping address is required"),
  couponCode: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
      })
    )
    .optional(),
});

// ✅ NEW: Initiate payment DTO
const InitiatePaymentDTOSchema = z.object({
  shippingAddressId: z.string().min(1, "Shipping address is required"),
  billingAddressId: z.string().min(1, "Billing address is required"),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(["CARD","UPI","NETBANKING","WALLET","EMI","COD","PAYLATER"]),
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
      })
    )
    .optional(),
});

@injectable()
export class OrderController {
  constructor(@inject(OrderService) private orderService: OrderService) {}

  /**
   * Get order preview
   * POST /api/orders/preview
   */
  async getOrderPreview(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = OrderPreviewDTOSchema.parse(req.body);

      const preview = await this.orderService.getOrderPreview(userId, {
        shippingAddressId: data.shippingAddressId,
        couponCode: data.couponCode,
        items: data.items,
      });

      res.json({
        success: true,
        data: preview,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * ✅ NEW: Initiate payment (creates Razorpay order WITHOUT DB order)
   * POST /api/orders/initiate-payment
   */
  async initiatePayment(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = InitiatePaymentDTOSchema.parse(req.body);


      const result = await this.orderService.initiatePayment(userId, {
        shippingAddressId: data.shippingAddressId,
        billingAddressId: data.billingAddressId,
        couponCode: data.couponCode,
        paymentMethod: data.paymentMethod,
        items: data.items,
      });

      res.status(200).json({
        success: true,
        message: "Payment session created",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * ✅ UPDATED: Verify payment AND create order
   * POST /api/orders/verify-payment
   */
  async verifyPayment(req: Request, res: Response) {
    try {
      const data = VerifyPaymentDTOSchema.parse(req.body);
      const order = await this.orderService.verifyPayment(data);

      res.json({
        success: true,
        message: "Payment verified and order created successfully",
        data: order,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getUserOrders(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const params = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await this.orderService.getUserOrders(userId, params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getOrder(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const order = await this.orderService.getOrder(userId, id);

      res.json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getOrderByNumber(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { orderNumber } = req.params;

      if (!orderNumber) {
        res
          .status(400)
          .json({ success: false, message: "Order number is required" });
        return;
      }

      const order = await this.orderService.getOrderByNumber(
        userId,
        orderNumber
      );

      res.json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async cancelOrder(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const data = CancelOrderDTOSchema.parse(req.body);
      const result = await this.orderService.cancelOrder(
        userId,
        id,
        data.reason
      );

      res.json({
        success: true,
        message: result.message,
        data: {
          order: result.order,
          refundProcessed: result.refundProcessed,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async canCancelOrder(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const result = await this.orderService.canCancelOrder(userId, id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Admin endpoints
  async getAllOrders(req: Request, res: Response) {
    try {
      const params = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await this.orderService.getAllOrders(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateOrderStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = UpdateOrderStatusDTOSchema.parse(req.body);

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const order = await this.orderService.updateOrderStatus(id, data.status);

      res.json({
        success: true,
        message: "Order status updated successfully",
        data: order,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}