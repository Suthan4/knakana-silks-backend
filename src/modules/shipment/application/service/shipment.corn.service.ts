import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IShipmentRepository } from "@/modules/shipment/infrastructure/interface/Ishipmentrepository.js";
import { IOrderShippingInfoRepository } from "@/modules/order/infrastructure/interface/Iordershippinginforepository.js";
import { ShiprocketService } from "@/modules/shipment/infrastructure/services/shiprocket.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { OrderStatus } from "@/generated/prisma/enums.js";

@injectable()
export class ShipmentCronService {
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("IShipmentRepository") private shipmentRepository: IShipmentRepository,
    @inject("IOrderShippingInfoRepository") private orderShippingInfoRepository: IOrderShippingInfoRepository,
    @inject(ShiprocketService) private shiprocketService: ShiprocketService,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * ✅ Auto-generate AWB for orders that:
   * 1. Are in PROCESSING status
   * 2. Have Shiprocket order created (shiprocketOrderId exists)
   * 3. Don't have AWB yet (awbCode is null)
   * 4. Have courier selection in shipping info
   */
  async autoGenerateAwbForPendingOrders() {
    try {
      console.log("⏳ Starting auto AWB generation...");

      // ✅ Find eligible orders
      const orders = await this.orderRepository.findManyForAutoAwb({ take: 20 });

      if (orders.length === 0) {
        console.log("✅ No orders pending AWB generation");
        return { processed: 0, success: 0, failed: 0 };
      }

      console.log(`📦 Found ${orders.length} orders pending AWB generation`);

      let successCount = 0;
      let failedCount = 0;

      for (const order of orders) {
        try {
          await this.generateAwbForOrder(order);
          successCount++;
        } catch (error: any) {
          console.error(`❌ Failed to generate AWB for order ${order.orderNumber}:`, error.message);
          failedCount++;
        }
      }

      console.log(`✅ AWB generation complete: ${successCount} success, ${failedCount} failed`);

      return {
        processed: orders.length,
        success: successCount,
        failed: failedCount,
      };
    } catch (error) {
      console.error("❌ Auto AWB generation failed:", error);
      throw error;
    }
  }

  /**
   * ✅ Generate AWB for a single order
   */
  private async generateAwbForOrder(order: any) {
    const shipment = order.shipment;
    const shippingInfo = order.shippingInfo;

    if (!shipment || !shipment.shiprocketShipmentId) {
      throw new Error("Shipment ID not found");
    }

    if (!shippingInfo || !shippingInfo.selectedCourierCompanyId) {
      throw new Error("No courier selected");
    }

    console.log(`📦 Generating AWB for order ${order.orderNumber}...`);
    console.log(`   Courier: ${shippingInfo.selectedCourierName} (ID: ${shippingInfo.selectedCourierCompanyId})`);

    // ✅ Call Shiprocket to generate AWB
    const awbResponse = await this.shiprocketService.generateAwb({
      shipmentId: parseInt(shipment.shiprocketShipmentId),
      courierId: shippingInfo.selectedCourierCompanyId,
    });

    const awbCode = awbResponse.response.data.awb_code;
    const courierName = awbResponse.response.data.courier_name;

    console.log(`✅ AWB generated: ${awbCode} (${courierName})`);

    // ✅ Update shipment with AWB
    await this.shipmentRepository.update(shipment.id, {
      awbCode,
      courierName,
    });

    // ✅ Schedule pickup automatically after AWB generation
    try {
      await this.shiprocketService.schedulePickup([parseInt(shipment.shiprocketOrderId!)]);

      // ✅ Mark as SHIPPED
      await this.shipmentRepository.update(shipment.id, {
        shippedAt: new Date(),
      });

      await this.orderRepository.update(order.id, {
        status: OrderStatus.SHIPPED,
      });

      console.log(`✅ Pickup scheduled and order marked as SHIPPED: ${order.orderNumber}`);

      // ✅ Send shipping notification email
      try {
        await this.emailService.sendShippingNotification({
          email: order.user.email,
          firstName: order.user.firstName,
          orderNumber: order.orderNumber,
          trackingNumber: awbCode,
          courierName,
        });
      } catch (error) {
        console.error("Failed to send shipping email:", error);
      }
    } catch (pickupError) {
      console.error(`❌ Pickup scheduling failed for ${order.orderNumber}:`, pickupError);
      // ✅ AWB is generated but pickup failed - admin can retry manually
    }
  }
}