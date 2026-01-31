import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IShipmentRepository } from "@/modules/shipment/infrastructure/interface/Ishipmentrepository.js";
import { IOrderShippingInfoRepository } from "@/modules/order/infrastructure/interface/Iordershippinginforepository.js";
import { ShiprocketService } from "@/modules/shipment/infrastructure/services/shiprocket.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { OrderStatus } from "@/generated/prisma/enums.js";

@injectable()
export class ShipmentCronService {
    // ✅ Add configuration flag
  private readonly AUTO_SCHEDULE_PICKUP = false;
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

    
    // ✅ 🆕 CONDITIONAL AUTO-PICKUP
    if(this.AUTO_SCHEDULE_PICKUP){
        // ========================================
      // OPTION A: AUTO-PICKUP (Default)
      // ========================================
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
    }else{
      // ========================================
      // OPTION B: MANUAL PICKUP (Requires Admin Approval)
      // ========================================
      console.log(`⏸️ Auto-pickup DISABLED - awaiting admin approval for ${order.orderNumber}`);
      
      // ✅ Keep status as PROCESSING (admin must manually schedule pickup)
      // No status change - stays as PROCESSING
      
      // ✅ Send admin notification for pickup approval
      try {
        await this.emailService.sendEmail({
          to: process.env.ADMIN_EMAIL || "admin@kankanasilks.com",
          subject: `⏳ Pickup Approval Required - Order ${order.orderNumber}`,
          html: this.getAdminPickupApprovalEmailTemplate(
            order.orderNumber,
            awbCode,
            courierName,
            order.id.toString()
          ),
        });
        
        console.log(`📧 Admin notification sent for pickup approval: ${order.orderNumber}`);
        
      } catch (error) {
        console.error("Failed to send admin notification:", error);
      }

      // ✅ Optional: Send customer email saying "Order is being prepared"
      try {
        await this.emailService.sendEmail({
          to: order.user.email,
          subject: `Order ${order.orderNumber} - Preparing for Shipment`,
          html: this.getCustomerPreparingEmailTemplate(
            order.user.firstName,
            order.orderNumber
          ),
        });
      } catch (error) {
        console.error("Failed to send customer notification:", error);
      }
    }

  }

   /**
   * 🆕 Admin notification email template
   */
  private getAdminPickupApprovalEmailTemplate(
    orderNumber: string,
    awbCode: string,
    courierName: string,
    orderId: string
  ): string {
    const adminPanelUrl = process.env.ADMIN_PANEL_URL || "http://localhost:3000/admin";
    
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
          .button { 
            display: inline-block;
            background-color: #4F46E5;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin: 10px 0;
          }
          .alert { background-color: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏳ Pickup Approval Required</h1>
          </div>
          <div class="content">
            <div class="alert">
              <strong>Action Required:</strong> New order ready for pickup scheduling
            </div>
            
            <div class="info-box">
              <p><strong>Order Number:</strong> ${orderNumber}</p>
              <p><strong>AWB Code:</strong> ${awbCode}</p>
              <p><strong>Courier:</strong> ${courierName}</p>
              <p><strong>Status:</strong> AWB Generated - Awaiting Pickup</p>
            </div>
            
            <p>
              <a href="${adminPanelUrl}/shipments/${orderId}" class="button">
                Schedule Pickup Now
              </a>
            </p>
            
            <p style="color: #666; font-size: 14px;">
              Or schedule pickup via API:<br>
              <code>POST /api/admin/shipments/schedule-pickup</code><br>
              <code>{ "orderId": "${orderId}" }</code>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * 🆕 Customer "preparing" email template
   */
  private getCustomerPreparingEmailTemplate(
    firstName: string,
    orderNumber: string
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
            <h1>📦 Preparing Your Order</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Great news! Your order is being prepared for shipment.</p>
            
            <div class="info-box">
              <p><strong>Order Number:</strong> ${orderNumber}</p>
              <p><strong>Status:</strong> Being Prepared</p>
            </div>
            
            <p>We're carefully packing your items and will ship them soon. You'll receive a tracking number once the package is handed over to the courier.</p>
            
            <p>Thank you for your patience!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}