import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IShipmentRepository } from "@/modules/shipment/infrastructure/interface/Ishipmentrepository.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { OrderStatus } from "@/generated/prisma/enums.js";

/**
 * ✅ Shiprocket Webhook Service
 * Handles automatic status synchronization from Shiprocket to our database
 * 
 * Webhook URL: POST /api/webhooks/shiprocket (no auth required)
 * 
 * Shiprocket Status → Our OrderStatus mapping:
 * - "SHIPPED" → SHIPPED
 * - "OUT FOR DELIVERY" / "OUT_FOR_DELIVERY" → OUT_FOR_DELIVERY  
 * - "DELIVERED" → DELIVERED
 * - "RTO" / "CANCELLED" → CANCELLED (with refund)
 */

@injectable()
export class ShiprocketWebhookService {
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("IShipmentRepository") private shipmentRepository: IShipmentRepository,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * ✅ Process Shiprocket webhook payload
   * 
   * Shiprocket sends webhooks for:
   * - Order Shipped
   * - Out for Delivery
   * - Delivered
   * - RTO (Return to Origin)
   * - Cancelled
   */
  async processWebhook(payload: any) {
    console.log("📦 Shiprocket webhook received:", JSON.stringify(payload, null, 2));

    try {
      // Extract data from webhook
      const {
        awb,
        order_id,
        shipment_id,
        current_status,
        delivered_date,
      } = payload;

      if (!awb && !order_id && !shipment_id) {
        throw new Error("Missing required identifiers (awb, order_id, or shipment_id)");
      }

      // ✅ Find shipment by AWB, Shiprocket Order ID, or Order Number
      let shipment = null;

      if (awb) {
        shipment = await this.shipmentRepository.findByTrackingNumber(awb);
      }

      if (!shipment && shipment_id) {
        shipment = await this.shipmentRepository.findByShiprocketOrderId(
          shipment_id.toString()
        );
      }

      if (!shipment && order_id) {
        // Try to find order by order number
        const order = await this.orderRepository.findByOrderNumber(order_id.toString());
        if (order) {
          shipment = await this.shipmentRepository.findByOrderId(order.id);
        }
      }

      if (!shipment) {
        console.warn(`⚠️ Shipment not found for webhook: ${JSON.stringify({ awb, order_id, shipment_id })}`);
        return {
          success: false,
          message: "Shipment not found",
        };
      }

      // ✅ Get order
      const order = await this.orderRepository.findById(shipment.orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      // ✅ Map Shiprocket status to our OrderStatus
      const newStatus = this.mapShiprocketStatus(current_status);

      if (!newStatus) {
        console.warn(`⚠️ Unknown Shiprocket status: ${current_status}`);
        return {
          success: false,
          message: `Unknown status: ${current_status}`,
        };
      }

      console.log(`✅ Updating order ${order.orderNumber}: ${order.status} → ${newStatus}`);

      // ✅ Update order status
      await this.orderRepository.update(order.id, {
        status: newStatus,
      });

      // ✅ Update shipment details
      const shipmentUpdate: any = {};

      if (newStatus === OrderStatus.DELIVERED && delivered_date) {
        shipmentUpdate.deliveredAt = new Date(delivered_date);
      }

      if (Object.keys(shipmentUpdate).length > 0) {
        await this.shipmentRepository.update(shipment.id, shipmentUpdate);
      }

      // ✅ Send email notifications
      try {
        switch (newStatus) {
          case OrderStatus.SHIPPED:
            await this.emailService.sendShippingNotification({
              email: order.user.email,
              firstName: order.user.firstName,
              orderNumber: order.orderNumber,
              trackingNumber: shipment.awbCode ?? undefined,
              courierName: shipment.courierName ?? undefined,
            });
            break;

          case OrderStatus.OUT_FOR_DELIVERY:
            await this.emailService.sendEmail({
              to: order.user.email,
              subject: `Order Out for Delivery - ${order.orderNumber}`,
              html: this.getOutForDeliveryEmailTemplate(
                order.user.firstName,
                order.orderNumber,
                shipment.awbCode || "N/A"
              ),
            });
            break;

          case OrderStatus.DELIVERED:
            await this.emailService.sendDeliveryConfirmation({
              email: order.user.email,
              firstName: order.user.firstName,
              orderNumber: order.orderNumber,
            });
            break;

          case OrderStatus.CANCELLED:
            await this.emailService.sendEmail({
              to: order.user.email,
              subject: `Order Cancelled - ${order.orderNumber}`,
              html: this.getCancellationEmailTemplate(
                order.user.firstName,
                order.orderNumber,
                "Shipment returned to origin or cancelled by courier"
              ),
            });
            break;
        }
      } catch (error) {
        console.error("Failed to send email notification:", error);
        // Don't fail the webhook due to email error
      }

      console.log(`✅ Webhook processed successfully for order ${order.orderNumber}`);

      return {
        success: true,
        message: "Webhook processed successfully",
        data: {
          orderNumber: order.orderNumber,
          oldStatus: order.status,
          newStatus,
        },
      };
    } catch (error: any) {
      console.error("❌ Webhook processing failed:", error);
      throw error;
    }
  }

  /**
   * ✅ Map Shiprocket status to our OrderStatus enum
   */
  private mapShiprocketStatus(shiprocketStatus: string): OrderStatus | null {
    const statusMap: Record<string, OrderStatus> = {
      // Shipped
      SHIPPED: OrderStatus.SHIPPED,
      IN_TRANSIT: OrderStatus.SHIPPED,

      // Out for Delivery
      "OUT FOR DELIVERY": OrderStatus.OUT_FOR_DELIVERY,
      OUT_FOR_DELIVERY: OrderStatus.OUT_FOR_DELIVERY,
      "OUT-FOR-DELIVERY": OrderStatus.OUT_FOR_DELIVERY,

      // Delivered
      DELIVERED: OrderStatus.DELIVERED,

      // Cancelled/RTO
      RTO: OrderStatus.CANCELLED,
      CANCELLED: OrderStatus.CANCELLED,
      CANCELED: OrderStatus.CANCELLED,
      LOST: OrderStatus.CANCELLED,
    };

    const normalized = shiprocketStatus?.toUpperCase().replace(/[_\s-]/g, "_");
    return statusMap[normalized] || statusMap[shiprocketStatus?.toUpperCase()] || null;
  }

  /**
   * Email template: Out for Delivery
   */
  private getOutForDeliveryEmailTemplate(
    firstName: string,
    orderNumber: string,
    awb: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .info-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚚 Out for Delivery!</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Great news! Your order is out for delivery and will reach you soon.</p>
            
            <div class="info-box">
              <p><strong>Order Number:</strong> ${orderNumber}</p>
              <p><strong>AWB Code:</strong> ${awb}</p>
            </div>
            
            <p>Please keep your phone handy. The delivery partner will contact you shortly.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Email template: Cancellation (RTO)
   */
  private getCancellationEmailTemplate(
    firstName: string,
    orderNumber: string,
    reason: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #EF4444; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .info-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Cancelled</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Your order has been cancelled.</p>
            
            <div class="info-box">
              <p><strong>Order Number:</strong> ${orderNumber}</p>
              <p><strong>Reason:</strong> ${reason}</p>
            </div>
            
            <p>Refund will be processed within 5-7 business days if payment was already made.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}