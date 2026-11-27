import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IShipmentRepository } from "@/modules/shipment/infrastructure/interface/Ishipmentrepository.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { OrderStatus } from "@/generated/prisma/enums.js";

/**
 * ✅ Shiprocket Webhook Service
 * Handles automatic status synchronization from Shiprocket to our database
 * 
 * Webhook URL: POST /api/webhooks/delivery-status
 * Configure the Shiprocket webhook security token to match SHIPROCKET_WEBHOOK_SECRET.
 * Shiprocket sends this value in the x-api-key header.
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
    const {
      awb,
      order_id,
      sr_order_id,
      channel_order_id,
      shipment_id,
      current_status,
      shipment_status,
      shipment_status_id,
      delivered_date,
    } = payload ?? {};

    console.info("Shiprocket delivery event received", {
      awb,
      order_id,
      sr_order_id,
      shipment_id,
      current_status,
      shipment_status,
      shipment_status_id,
    });

    if (!awb && !order_id && !sr_order_id && !shipment_id && !channel_order_id) {
      throw new Error("Webhook is missing AWB, order ID, and shipment ID.");
    }

    // Match using the exact Shiprocket identifier columns. AWB lookup also
    // checks both our trackingNumber and awbCode for older shipment records.
    let shipment = null;

    if (typeof awb === "string" && awb.trim()) {
      shipment = await this.shipmentRepository.findByTrackingNumber(awb.trim());
    }

    if (!shipment && shipment_id !== undefined && shipment_id !== null) {
      shipment = await this.shipmentRepository.findByShiprocketShipmentId(
        String(shipment_id)
      );
    }

    if (!shipment && sr_order_id !== undefined && sr_order_id !== null) {
      shipment = await this.shipmentRepository.findByShiprocketOrderId(
        String(sr_order_id)
      );
    }

    // Shiprocket's order_id is the merchant/channel order ID; sr_order_id is
    // Shiprocket's internal order ID. The channel ID maps to our order number.
    const channelOrderNumber = channel_order_id ?? order_id;
    if (!shipment && channelOrderNumber !== undefined && channelOrderNumber !== null) {
      const orderByNumber = await this.orderRepository.findByOrderNumber(
        String(channelOrderNumber)
      );
      if (orderByNumber) {
        shipment = await this.shipmentRepository.findByOrderId(orderByNumber.id);
      }
    }

    if (!shipment) {
      console.warn("Shiprocket event did not match a local shipment", {
        awb,
        order_id,
        sr_order_id,
        shipment_id,
        channel_order_id,
      });
      return { success: true, message: "No matching shipment; event acknowledged." };
    }

    const order = await this.orderRepository.findById(shipment.orderId);
    if (!order) {
      throw new Error("Order for Shiprocket shipment was not found.");
    }

    const shipmentStatusId = Number(shipment_status_id);
    const statusText =
      (typeof current_status === "string" && current_status.trim()
        ? current_status
        : shipment_status) || "";

    // Shiprocket's shipment_status_id 7 is the canonical Delivered code.
    // Do not treat RTO Delivered (10) or Partial Delivered (23) as customer
    // delivery. Exact string matching is retained as a fallback for payloads
    // that omit shipment_status_id.
    const newStatus =
      shipmentStatusId === 7
        ? OrderStatus.DELIVERED
        : this.mapShiprocketStatus(statusText);

    if (!newStatus) {
      console.info("Ignoring unsupported Shiprocket status", { statusText, shipmentStatusId });
      return { success: true, message: `Status ignored: ${statusText || "unknown"}` };
    }

    const oldStatus = order.status;

    // Delivery is terminal for this forward-shipment workflow. Late in-transit
    // events must never move a delivered order backwards.
    if (oldStatus === OrderStatus.DELIVERED && newStatus !== OrderStatus.DELIVERED) {
      return {
        success: true,
        message: "Order is already delivered; stale tracking event ignored.",
        data: { orderNumber: order.orderNumber, oldStatus, newStatus: oldStatus },
      };
    }

    const statusChanged = oldStatus !== newStatus;

    if (statusChanged) {
      await this.orderRepository.update(order.id, { status: newStatus });
    }

    const shipmentUpdate: {
      awbCode?: string;
      trackingNumber?: string;
      deliveredAt?: Date;
    } = {};

    if (typeof awb === "string" && awb.trim() && !shipment.awbCode) {
      shipmentUpdate.awbCode = awb.trim();
      shipmentUpdate.trackingNumber = awb.trim();
    }

    // Even when Shiprocket omits delivered_date (it often sends an empty
    // string), a confirmed Delivered event must set deliveredAt so the admin
    // workflow and delivery timestamp remain consistent.
    if (newStatus === OrderStatus.DELIVERED && !shipment.deliveredAt) {
      shipmentUpdate.deliveredAt = this.parseDeliveredDate(delivered_date);
    }

    if (Object.keys(shipmentUpdate).length > 0) {
      await this.shipmentRepository.update(shipment.id, shipmentUpdate);
    }

    // Webhooks are retried by providers. Send customer notifications only on
    // an actual state transition, not for duplicate deliveries of the event.
    if (statusChanged) {
      try {
        switch (newStatus) {
          case OrderStatus.SHIPPED:
            await this.emailService.sendShippingNotification({
              email: order.user.email,
              firstName: order.user.firstName,
              orderNumber: order.orderNumber,
              trackingNumber: shipment.awbCode ?? (typeof awb === "string" ? awb : undefined),
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
                shipment.awbCode || (typeof awb === "string" ? awb : "N/A")
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
        console.error("Failed to send Shiprocket status email:", error);
        // Email failures must not cause Shiprocket to retry a successful status update.
      }
    }

    console.info("Shiprocket status synchronized", {
      orderNumber: order.orderNumber,
      oldStatus,
      newStatus,
      statusChanged,
    });

    return {
      success: true,
      message: "Shiprocket status synchronized.",
      data: {
        orderNumber: order.orderNumber,
        oldStatus,
        newStatus,
        deliveredAt:
          newStatus === OrderStatus.DELIVERED
            ? (shipmentUpdate.deliveredAt ?? shipment.deliveredAt)
            : undefined,
      },
    };
  }

  private parseDeliveredDate(value: unknown): Date {
    if (typeof value !== "string" || !value.trim() || value.trim().toUpperCase() === "NA") {
      return new Date();
    }

    const raw = value.trim();

    // Shiprocket commonly sends "DD MM YYYY HH:mm:ss" in IST.
    const dmy = raw.match(
      /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (dmy) {
      const [, day, month, year, hour = "0", minute = "0", second = "0"] = dmy;
      return new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        ) - 330 * 60 * 1000
      );
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /**
   * ✅ Map Shiprocket status to our OrderStatus enum
   */
  private mapShiprocketStatus(shiprocketStatus: string): OrderStatus | null {
    const statusMap: Record<string, OrderStatus> = {
      // Shipped
      SHIPPED: OrderStatus.SHIPPED,
      PICKED_UP: OrderStatus.SHIPPED,
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