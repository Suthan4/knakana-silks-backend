import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IShipmentRepository } from "@/modules/shipment/infrastructure/interface/Ishipmentrepository.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { OrderStatus, ReturnStatus } from "@/generated/prisma/enums.js";
import { IReturnRepository } from "@/modules/return/infrastructure/interface/Ireturnrepository.js";

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
    @inject("IReturnRepository") private returnRepository: IReturnRepository,
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
    const data = payload ?? {};
    const {
      awb,
      order_id,
      sr_order_id,
      channel_order_id,
      shipment_id,
      current_status,
      current_status_id,
      shipment_status,
      shipment_status_id,
      delivered_date,
      current_location,
      is_return,
      scans,
    } = data;

    const awbCode = typeof awb === "string" ? awb.trim() : "";
    const shipmentId =
      shipment_id !== undefined && shipment_id !== null
        ? String(shipment_id)
        : "";
    const statusText =
      (typeof current_status === "string" && current_status.trim()
        ? current_status
        : shipment_status) || "";
    const normalizedStatus = String(statusText).trim().toUpperCase();
    const statusId = Number(shipment_status_id);
    const currentStatusId = Number(current_status_id);

    console.info("Shiprocket delivery event received", {
      awb: awbCode || undefined,
      order_id,
      sr_order_id,
      shipment_id,
      current_status: statusText,
      current_status_id,
      shipment_status_id,
      is_return,
    });

    // Shiprocket's Test Webhook may submit a connectivity payload without a
    // real AWB/order reference. Once the shared token is validated, acknowledge
    // it with 200; there is no shipment to mutate in that case.
    if (!awbCode && !order_id && !sr_order_id && !shipmentId && !channel_order_id) {
      return {
        success: true,
        message: "Webhook endpoint verified; no shipment identifiers were supplied.",
      };
    }

    // Reverse/return shipments must be matched before forward shipments because
    // their status lifecycle is different and must never mark the buyer order
    // as delivered.
    const returnIdentifierFilters: any[] = [];
    if (awbCode) returnIdentifierFilters.push({ awb: awbCode });
    if (shipmentId) {
      returnIdentifierFilters.push({ shiprocketShipmentId: shipmentId });
    }

    if (returnIdentifierFilters.length > 0) {
      const matchingReturns = await this.returnRepository.findAll({
        skip: 0,
        take: 1,
        where: {
          returnShipment: {
            is: { OR: returnIdentifierFilters },
          },
        },
      });

      const returnRequest = matchingReturns[0];
      if (returnRequest?.returnShipment) {
        const latestScan = Array.isArray(scans) ? scans[0] : undefined;
        const location =
          (typeof current_location === "string" && current_location) ||
          latestScan?.location ||
          undefined;

        await this.returnRepository.updateReturnShipment(
          returnRequest.returnShipment.id,
          {
            status: statusText || returnRequest.returnShipment.status,
            currentLocation: location,
            ...(awbCode && !returnRequest.returnShipment.awb
              ? { awb: awbCode }
              : {}),
          }
        );

        const returnDelivered =
          statusId === 7 ||
          statusId === 26 ||
          /RETURN\s+DELIVERED|DELIVERED\s+TO\s+(?:SELLER|WAREHOUSE)/i.test(normalizedStatus) ||
          (String(is_return) === "1" && normalizedStatus === "DELIVERED");
        const returnPickedUp =
          statusId === 42 ||
          currentStatusId === 42 ||
          /RETURN\s+PICK(?:ED)?\s*UP|PICKED\s*UP/i.test(normalizedStatus);
        const returnInTransit =
          statusId === 18 ||
          statusId === 25 ||
          /IN\s*TRANSIT/i.test(normalizedStatus);

        let nextReturnStatus: ReturnStatus | null = null;
        if (returnDelivered) {
          nextReturnStatus = ReturnStatus.RECEIVED;
        } else if (returnPickedUp) {
          nextReturnStatus = ReturnStatus.PICKED_UP;
        } else if (returnInTransit) {
          nextReturnStatus = ReturnStatus.IN_TRANSIT;
        }

        const terminalReturnStatuses: ReturnStatus[] = [
          ReturnStatus.RECEIVED,
          ReturnStatus.INSPECTED,
          ReturnStatus.REFUND_INITIATED,
          ReturnStatus.REFUND_COMPLETED,
          ReturnStatus.REJECTED,
          ReturnStatus.CLOSED,
        ];

        if (
          nextReturnStatus &&
          !terminalReturnStatuses.includes(returnRequest.status)
        ) {
          await this.returnRepository.update(returnRequest.id, {
            status: nextReturnStatus,
          });
        }

        return {
          success: true,
          message: "Shiprocket reverse shipment status synchronized.",
          data: {
            returnNumber: returnRequest.returnNumber,
            status: nextReturnStatus ?? returnRequest.status,
            shiprocketStatus: statusText,
          },
        };
      }
    }

    // Forward shipment lookup uses Shiprocket's real identifier columns:
    // shipment_id -> shiprocketShipmentId, sr_order_id -> shiprocketOrderId,
    // and AWB -> awbCode/trackingNumber.
    let shipment = null;

    if (awbCode) {
      shipment = await this.shipmentRepository.findByTrackingNumber(awbCode);
    }

    if (!shipment && shipmentId) {
      shipment = await this.shipmentRepository.findByShiprocketShipmentId(
        shipmentId
      );
    }

    if (
      !shipment &&
      sr_order_id !== undefined &&
      sr_order_id !== null
    ) {
      shipment = await this.shipmentRepository.findByShiprocketOrderId(
        String(sr_order_id)
      );
    }

    const channelOrderNumber = channel_order_id ?? order_id;
    if (
      !shipment &&
      channelOrderNumber !== undefined &&
      channelOrderNumber !== null
    ) {
      const orderByNumber = await this.orderRepository.findByOrderNumber(
        String(channelOrderNumber)
      );
      if (orderByNumber) {
        shipment = await this.shipmentRepository.findByOrderId(orderByNumber.id);
      }
    }

    if (!shipment) {
      console.warn("Shiprocket event did not match a local shipment", {
        awb: awbCode || undefined,
        order_id,
        sr_order_id,
        shipment_id,
        channel_order_id,
      });
      return {
        success: true,
        message: "No matching shipment; event acknowledged.",
      };
    }

    const order = await this.orderRepository.findById(shipment.orderId);
    if (!order) {
      throw new Error("Order for Shiprocket shipment was not found.");
    }

    const isRto =
      statusId === 9 ||
      statusId === 10 ||
      /\bRTO\b|RETURN\s+TO\s+ORIGIN/i.test(normalizedStatus);
    const isDelivered =
      statusId === 7 ||
      (!Number.isFinite(statusId) && normalizedStatus === "DELIVERED");

    // Status IDs from Shiprocket's shipment status table are authoritative.
    // RTO Initiated (9) and RTO Delivered (10) are not buyer delivery.
    let nextOrderStatus: OrderStatus | null = null;
    if (isDelivered) {
      nextOrderStatus = OrderStatus.DELIVERED;
    } else if (isRto) {
      nextOrderStatus = null;
    } else if (statusId === 17 || /OUT\s+FOR\s+DELIVERY/i.test(normalizedStatus)) {
      nextOrderStatus = OrderStatus.OUT_FOR_DELIVERY;
    } else if (
      statusId === 6 ||
      statusId === 18 ||
      statusId === 42 ||
      /SHIPPED|PICKED\s*UP|IN\s*TRANSIT/i.test(normalizedStatus)
    ) {
      nextOrderStatus = OrderStatus.SHIPPED;
    } else if (
      statusId === 8 ||
      statusId === 45 ||
      /^(CANCELLED|CANCELED)$/i.test(normalizedStatus)
    ) {
      nextOrderStatus = OrderStatus.CANCELLED;
    }

    if (!nextOrderStatus && !isRto) {
      console.info("Ignoring unsupported Shiprocket status", {
        statusText,
        shipment_status_id,
        current_status_id,
      });
    }

    const oldStatus = order.status;
    // Never allow a late provider event to move a delivered order backwards.
    const mayUpdateOrder =
      nextOrderStatus !== null &&
      (oldStatus !== OrderStatus.DELIVERED ||
        nextOrderStatus === OrderStatus.DELIVERED);
    const statusChanged =
      mayUpdateOrder && nextOrderStatus !== oldStatus;

    if (statusChanged && nextOrderStatus) {
      await this.orderRepository.update(order.id, {
        status: nextOrderStatus,
      });
    }

    const shipmentUpdate: {
      awbCode?: string;
      trackingNumber?: string;
      deliveredAt?: Date;
      shiprocketStatus?: string;
      shiprocketStatusId?: number;
      statusUpdatedAt?: Date;
    } = {
      shiprocketStatus: String(statusText || "UNKNOWN"),
      shiprocketStatusId: Number.isFinite(statusId) ? statusId : undefined,
      statusUpdatedAt: new Date(),
    };

    if (awbCode && !shipment.awbCode) {
      shipmentUpdate.awbCode = awbCode;
      shipmentUpdate.trackingNumber = awbCode;
    }

    if (isDelivered && !shipment.deliveredAt) {
      shipmentUpdate.deliveredAt = this.parseDeliveredDate(delivered_date);
    }

    await this.shipmentRepository.update(shipment.id, shipmentUpdate);

    // Notify customers once per actual order status transition. RTO is kept as
    // a provider shipment state and does not send a false cancellation/refund.
    if (statusChanged && nextOrderStatus) {
      try {
        switch (nextOrderStatus) {
          case OrderStatus.SHIPPED:
            await this.emailService.sendShippingNotification({
              email: order.user.email,
              firstName: order.user.firstName,
              orderNumber: order.orderNumber,
              trackingNumber: shipment.awbCode ?? (awbCode || undefined),
              courierName: shipment.courierName ?? undefined,
            });
            break;

          case OrderStatus.OUT_FOR_DELIVERY:
            await this.emailService.sendEmail({
              to: order.user.email,
              subject: \`Order Out for Delivery - \${order.orderNumber}\`,
              html: this.getOutForDeliveryEmailTemplate(
                order.user.firstName,
                order.orderNumber,
                shipment.awbCode || awbCode || "N/A"
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
              subject: \`Order Cancelled - \${order.orderNumber}\`,
              html: this.getCancellationEmailTemplate(
                order.user.firstName,
                order.orderNumber,
                "Shiprocket reported that the shipment was cancelled."
              ),
            });
            break;
        }
      } catch (error) {
        console.error("Failed to send Shiprocket status email:", error);
      }
    }

    console.info("Shiprocket status synchronized", {
      orderNumber: order.orderNumber,
      oldStatus,
      newStatus: nextOrderStatus ?? (isRto ? "RTO" : null),
      statusChanged,
    });

    return {
      success: true,
      message: "Shiprocket status synchronized.",
      data: {
        orderNumber: order.orderNumber,
        oldStatus,
        newStatus: nextOrderStatus ?? (isRto ? "RTO" : null),
        shiprocketStatus: statusText,
        deliveredAt:
          isDelivered
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

      // A real provider cancellation is not the same as RTO.
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