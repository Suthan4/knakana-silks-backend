import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";
import { IPaymentRepository } from "../../infrastructure/interface/Ipaymentrepository.js";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { OrderStatus, PaymentStatus } from "@/generated/prisma/enums.js";
import { RazorpayService } from "../../application/service/razorpay.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { Decimal } from "@prisma/client/runtime/client";

@injectable()
export class PaymentWebhookController {
  constructor(
    @inject(RazorpayService) private razorpayService: RazorpayService,
    @inject("IPaymentRepository")
    private paymentRepository: IPaymentRepository,
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * Handle Razorpay webhook
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      const signature = req.headers["x-razorpay-signature"] as string;
      const payload = JSON.stringify(req.body);

      // Verify webhook signature
      const isValid = this.razorpayService.verifyWebhookSignature(
        payload,
        signature
      );

      if (!isValid) {
        res.status(400).json({ success: false, message: "Invalid signature" });
        return;
      }

      const event = req.body.event;
      const payloadData = req.body.payload.payment.entity;

      console.log("Razorpay webhook received:", event);

      switch (event) {
        case "payment.authorized":
          await this.handlePaymentAuthorized(payloadData);
          break;

        case "payment.captured":
          await this.handlePaymentCaptured(payloadData);
          break;

        case "payment.failed":
          await this.handlePaymentFailed(payloadData);
          break;

        case "refund.created":
          await this.handleRefundCreated(payloadData);
          break;

        case "refund.processed":
          await this.handleRefundProcessed(payloadData);
          break;

        default:
          console.log("Unhandled webhook event:", event);
      }

      res.json({ success: true, message: "Webhook processed" });
    } catch (error: any) {
      console.error("Webhook processing failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Handle payment authorized
   */
  private async handlePaymentAuthorized(data: any) {
    const payment = await this.paymentRepository.findByRazorpayOrderId(
      data.order_id
    );

    if (!payment) {
      console.error("Payment not found for order:", data.order_id);
      return;
    }

    await this.paymentRepository.update(payment.id, {
      razorpayPaymentId: data.id,
      status: PaymentStatus.SUCCESS,
    });

    console.log("Payment authorized:", data.id);
  }

  /**
   * Handle payment captured
   */
  private async handlePaymentCaptured(data: any) {
    const payment = await this.paymentRepository.findByRazorpayPaymentId(
      data.id
    );

    if (!payment) {
      console.error("Payment not found:", data.id);
      return;
    }

    // Update payment status
    await this.paymentRepository.update(payment.id, {
      status: PaymentStatus.SUCCESS,
    });

    // Update order status
    await this.orderRepository.update(payment.orderId, {
      status: OrderStatus.PROCESSING,
    });

    // Get order details
    const order = await this.orderRepository.findById(payment.orderId);

    if (order) {
      // Send payment success email
      await this.emailService.sendPaymentSuccess({
        email: order.user.email,
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        amount: Number(payment.amount),
      });

      // Send order confirmation email
      await this.emailService.sendOrderConfirmation({
        email: order.user.email,
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        total: Number(order.total),
        items: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: Number(item.price),
        })),
      });
    }

    console.log("Payment captured:", data.id);
  }

  /**
   * Handle payment failed
   */
  private async handlePaymentFailed(data: any) {
    const payment = await this.paymentRepository.findByRazorpayOrderId(
      data.order_id
    );

    if (!payment) {
      console.error("Payment not found for order:", data.order_id);
      return;
    }

    await this.paymentRepository.update(payment.id, {
      razorpayPaymentId: data.id,
      status: PaymentStatus.FAILED,
    });

    // Optionally update order status
    await this.orderRepository.update(payment.orderId, {
      status: OrderStatus.CANCELLED,
    });

    console.log("Payment failed:", data.id);
  }

  /**
   * Handle refund created
   */
  private async handleRefundCreated(data: any) {
    const payment = await this.paymentRepository.findByRazorpayPaymentId(
      data.payment_id
    );

    if (!payment) {
      console.error("Payment not found:", data.payment_id);
      return;
    }

    await this.paymentRepository.update(payment.id, {
      status: PaymentStatus.REFUNDED,
      refundAmount: new Decimal(data.amount / 100), // Convert from paise to rupees
    });

    console.log("Refund created:", data.id);
  }

  /**
   * Handle refund processed
   */
  private async handleRefundProcessed(data: any) {
    console.log("Refund processed:", data.id);
    // Additional processing if needed
  }
}
