import { injectable, inject } from "tsyringe";
import { IReturnRepository } from "../../infrastructure/interface/Ireturnrepository.js";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IPaymentRepository } from "@/modules/payment/infrastructure/interface/Ipaymentrepository.js";
import { ShiprocketService } from "@/modules/shipment/infrastructure/services/shiprocket.service.js";
import { RazorpayService } from "@/modules/payment/application/service/razorpay.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { NumberUtil } from "@/shared/utils/index.js";
import {
  ReturnReason,
  ReturnStatus,
  RefundMethod,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/enums.js";
import { Prisma } from "@/generated/prisma/client.js";

@injectable()
export class ReturnService {
  constructor(
    @inject("IReturnRepository") private returnRepository: IReturnRepository,
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("IPaymentRepository") private paymentRepository: IPaymentRepository,
    @inject(ShiprocketService) private shiprocketService: ShiprocketService,
    @inject(RazorpayService) private razorpayService: RazorpayService,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * Create return request
   */
  async createReturn(
    userId: string,
    data: {
      orderId: string;
      orderItems: Array<{
        orderItemId: string;
        quantity: number;
        reason: ReturnReason;
      }>;
      reasonDetails: string;
      images: string[];
      refundMethod: RefundMethod;
      bankDetails?: any;
    }
  ) {
    const order = await this.orderRepository.findById(BigInt(data.orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    // Verify user owns the order
    if (order.userId !== BigInt(userId)) {
      throw new Error("Unauthorized: You can only return your own orders");
    }

    // Check if order is eligible for return
    if (order.status !== OrderStatus.DELIVERED) {
      throw new Error("Only delivered orders can be returned");
    }

    // Check return window (7 days from delivery)
    const RETURN_WINDOW_DAYS = 7;
    const deliveryDate = order.shipment?.deliveredAt;
    if (!deliveryDate) {
      throw new Error("Delivery date not found");
    }

    const daysSinceDelivery = Math.floor(
      (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
      throw new Error(
        `Return window of ${RETURN_WINDOW_DAYS} days has expired`
      );
    }

    // Validate order items belong to this order
    const orderItemIds = order.items.map((item) => item.id);
    const requestedItemIds = data.orderItems.map((item) =>
      BigInt(item.orderItemId)
    );

    for (const itemId of requestedItemIds) {
      if (!orderItemIds.includes(itemId)) {
        throw new Error("Invalid order item in return request");
      }
    }

    // Check if items already have return requests
    for (const item of data.orderItems) {
      const existingReturn = await this.returnRepository.findAll({
        skip: 0,
        take: 1,
        where: {
          orderId: order.id,
          returnItems: {
            some: {
              orderItemId: BigInt(item.orderItemId),
            },
          },
          status: {
            notIn: [ReturnStatus.REJECTED, ReturnStatus.CLOSED],
          },
        },
      });

      if (existingReturn.length > 0) {
        throw new Error(
          "One or more items already have active return requests"
        );
      }
    }

    // Calculate refund amount
    let refundAmount = 0;
    for (const item of data.orderItems) {
      const orderItem = order.items.find(
        (oi) => oi.id === BigInt(item.orderItemId)
      );
      if (orderItem) {
        refundAmount += Number(orderItem.price) * item.quantity;
      }
    }

    // Generate return number
    const returnNumber = this.generateReturnNumber();

    if (!data.orderItems || data.orderItems.length === 0) {
      throw new Error("At least one order item is required for return");
    }
    // Create return
    const returnRequest = await this.returnRepository.create({
      returnNumber,
      userId: BigInt(userId),
      orderId: order.id,
      reason: data.orderItems?.[0]?.reason ?? ReturnReason.OTHER, // Use first item's reason as primary
      reasonDetails: data.reasonDetails,
      images: data.images,
      status: ReturnStatus.PENDING,
      refundAmount,
      refundMethod: data.refundMethod,
      bankDetails: data.bankDetails,
    });

    // Add return items
    for (const item of data.orderItems) {
      const orderItem = order.items.find(
        (oi) => oi.id === BigInt(item.orderItemId)
      );
      if (orderItem) {
        await this.returnRepository.addReturnItem({
          returnId: returnRequest.id,
          orderItemId: orderItem.id,
          productId: orderItem.productId,
          variantId: orderItem.variantId ?? undefined,
          quantity: item.quantity,
          price: Number(orderItem.price),
        });
      }
    }

    // Send notification email
    try {
      await this.emailService.sendEmail({
        to: order.user.email,
        subject: `Return Request Submitted - ${returnNumber}`,
        html: this.getReturnRequestEmailTemplate(
          order.user.firstName,
          returnNumber,
          refundAmount
        ),
      });
    } catch (error) {
      console.error("Failed to send return request email:", error);
    }

    console.log(`✅ Return request created: ${returnNumber}`);

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Admin: Update return status
   */
  async updateReturnStatus(
    returnId: string,
    data: {
      status: ReturnStatus;
      adminNotes?: string;
      rejectionReason?: string;
    }
  ) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    // Validate status transition
    if (returnRequest.status === ReturnStatus.CLOSED) {
      throw new Error("Cannot update closed return requests");
    }

    const updateData: any = {
      status: data.status,
      adminNotes: data.adminNotes,
    };

    if (data.status === ReturnStatus.REJECTED) {
      if (!data.rejectionReason) {
        throw new Error("Rejection reason is required");
      }
      updateData.rejectionReason = data.rejectionReason;
    }

    const updated = await this.returnRepository.update(
      returnRequest.id,
      updateData
    );

    // Send status update email
    try {
      await this.emailService.sendEmail({
        to: returnRequest.user.email,
        subject: `Return Status Update - ${returnRequest.returnNumber}`,
        html: this.getReturnStatusEmailTemplate(
          returnRequest.user.firstName,
          returnRequest.returnNumber,
          data.status,
          data.rejectionReason
        ),
      });
    } catch (error) {
      console.error("Failed to send status update email:", error);
    }

    console.log(
      `✅ Return status updated: ${returnRequest.returnNumber} -> ${data.status}`
    );

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Admin: Schedule return pickup via Shiprocket
   */
  async scheduleReturnPickup(returnId: string, pickupDate: Date) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    if (returnRequest.status !== ReturnStatus.APPROVED) {
      throw new Error("Return must be approved before scheduling pickup");
    }

    const order = returnRequest.order;

    // Create return order in Shiprocket
    const returnOrderData = {
      orderId: `RET-${returnRequest.returnNumber}`,
      orderDate: new Date().toISOString(),
      channelId: "custom",
      pickupCustomerName: order.shippingAddress.fullName,
      pickupAddress: order.shippingAddress.addressLine1,
      pickupCity: order.shippingAddress.city,
      pickupPincode: order.shippingAddress.pincode,
      pickupState: order.shippingAddress.state,
      pickupCountry: order.shippingAddress.country,
      pickupEmail: returnRequest.user.email,
      pickupPhone: order.shippingAddress.phone,
      shippingCustomerName: process.env.WAREHOUSE_NAME || "Kangana Silks",
      shippingAddress: process.env.WAREHOUSE_ADDRESS || "",
      shippingCity: process.env.WAREHOUSE_CITY || "",
      shippingPincode: process.env.WAREHOUSE_PINCODE || "",
      shippingState: process.env.WAREHOUSE_STATE || "",
      shippingCountry: "India",
      shippingEmail: process.env.WAREHOUSE_EMAIL || "",
      shippingPhone: process.env.WAREHOUSE_PHONE || "",
      orderItems: returnRequest.returnItems.map((item) => ({
        name: item.product.name,
        sku: item.product.sku,
        units: item.quantity,
        sellingPrice: item.price,
      })),
    };

    const shiprocketOrder = await this.shiprocketService.createReturnOrder(
      returnOrderData
    );

    // Create return shipment record
    const returnShipment = await this.returnRepository.createReturnShipment({
      shiprocketOrderId: shiprocketOrder.order_id.toString(),
      awb: shiprocketOrder.shipment_id?.toString() || "",
      courierName: "Pending",
      pickupDate,
      status: "PICKUP_SCHEDULED",
    });

    // Link return shipment to return
    await this.returnRepository.update(returnRequest.id, {
      returnShipmentId: returnShipment.id,
      status: ReturnStatus.PICKUP_SCHEDULED,
    });

    console.log(`✅ Return pickup scheduled: ${returnRequest.returnNumber}`);

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Track return shipment
   */
  async trackReturnShipment(returnId: string) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest || !returnRequest.returnShipment) {
      throw new Error("Return shipment not found");
    }

    return this.shiprocketService.trackByAwb(returnRequest.returnShipment.awb);
  }

  /**
   * Admin: Process refund
   */
  async processRefund(returnId: string) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    if (returnRequest.status !== ReturnStatus.RECEIVED) {
      throw new Error("Return must be received before processing refund");
    }

    const payment = await this.paymentRepository.findByOrderId(
      returnRequest.orderId
    );

    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      throw new Error("Original payment not found or not successful");
    }

    // Process refund based on method
    if (returnRequest.refundMethod === RefundMethod.ORIGINAL_PAYMENT) {
      if (!payment.razorpayPaymentId) {
        throw new Error("Razorpay payment ID not found");
      }

      const refundResponse = await this.razorpayService.refundPayment(
        payment.razorpayPaymentId,
        Math.round(returnRequest.refundAmount * 100) // Convert to paise
      );

      await this.returnRepository.update(returnRequest.id, {
        status: ReturnStatus.REFUND_INITIATED,
        razorpayRefundId: refundResponse.id,
      });

      await this.paymentRepository.update(payment.id, {
        refundAmount: new Prisma.Decimal(payment.refundAmount).add(
          new Prisma.Decimal(returnRequest.refundAmount)
        ),
      });
    } else {
      // For other refund methods, mark as refund initiated
      await this.returnRepository.update(returnRequest.id, {
        status: ReturnStatus.REFUND_INITIATED,
      });
    }

    console.log(
      `✅ Refund initiated for return: ${returnRequest.returnNumber}`
    );

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Admin: Complete return
   */
  async completeReturn(returnId: string) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    if (returnRequest.status !== ReturnStatus.REFUND_INITIATED) {
      throw new Error("Refund must be initiated before completing return");
    }

    await this.returnRepository.update(returnRequest.id, {
      status: ReturnStatus.REFUND_COMPLETED,
    });

    // Send refund completion email
    try {
      await this.emailService.sendEmail({
        to: returnRequest.user.email,
        subject: `Refund Completed - ${returnRequest.returnNumber}`,
        html: this.getRefundCompletedEmailTemplate(
          returnRequest.user.firstName,
          returnRequest.returnNumber,
          returnRequest.refundAmount
        ),
      });
    } catch (error) {
      console.error("Failed to send refund completion email:", error);
    }

    console.log(`✅ Return completed: ${returnRequest.returnNumber}`);

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Get user returns
   */
  async getUserReturns(
    userId: string,
    params: {
      page: number;
      limit: number;
      status?: ReturnStatus;
      startDate?: string;
      endDate?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }
  ) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [returns, total] = await Promise.all([
      this.returnRepository.findByUserId(BigInt(userId), {
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.returnRepository.countByUserId(BigInt(userId), where),
    ]);

    return {
      returns,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Admin: Get all returns
   */
  async getAllReturns(params: {
    page: number;
    limit: number;
    status?: ReturnStatus;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [returns, total] = await Promise.all([
      this.returnRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.returnRepository.count(where),
    ]);

    return {
      returns,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Get return by ID
   */
  async getReturn(userId: string, returnId: string) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    // Verify user owns the return
    if (returnRequest.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return returnRequest;
  }

  /**
   * Helper: Generate return number
   */
  private generateReturnNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    return `RET-${timestamp}-${random}`;
  }

  /**
   * Helper: Get return request email template
   */
  private getReturnRequestEmailTemplate(
    firstName: string,
    returnNumber: string,
    refundAmount: number
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
            <h1>Return Request Submitted</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Your return request has been successfully submitted.</p>
            
            <div class="info-box">
              <p><strong>Return Number:</strong> ${returnNumber}</p>
              <p><strong>Expected Refund:</strong> ₹${refundAmount.toFixed(
                2
              )}</p>
              <p><strong>Status:</strong> Pending Review</p>
            </div>
            
            <p>Our team will review your request within 24-48 hours. You will receive an email once the return is approved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Helper: Get return status email template
   */
  private getReturnStatusEmailTemplate(
    firstName: string,
    returnNumber: string,
    status: ReturnStatus,
    rejectionReason?: string
  ): string {
    let statusMessage = "";
    let color = "#4F46E5";

    switch (status) {
      case ReturnStatus.APPROVED:
        statusMessage = "Your return request has been approved!";
        color = "#10B981";
        break;
      case ReturnStatus.REJECTED:
        statusMessage = "Your return request has been rejected.";
        color = "#EF4444";
        break;
      case ReturnStatus.PICKUP_SCHEDULED:
        statusMessage = "Pickup has been scheduled for your return.";
        break;
      case ReturnStatus.PICKED_UP:
        statusMessage = "Your return has been picked up.";
        break;
      case ReturnStatus.RECEIVED:
        statusMessage = "Your return has been received at our warehouse.";
        break;
      case ReturnStatus.REFUND_INITIATED:
        statusMessage = "Your refund has been initiated.";
        break;
      case ReturnStatus.REFUND_COMPLETED:
        statusMessage = "Your refund has been completed!";
        color = "#10B981";
        break;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${color}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .info-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Return Status Update</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>${statusMessage}</p>
            
            <div class="info-box">
              <p><strong>Return Number:</strong> ${returnNumber}</p>
              <p><strong>New Status:</strong> ${status}</p>
              ${
                rejectionReason
                  ? `<p><strong>Reason:</strong> ${rejectionReason}</p>`
                  : ""
              }
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Helper: Get refund completed email template
   */
  private getRefundCompletedEmailTemplate(
    firstName: string,
    returnNumber: string,
    refundAmount: number
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .info-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Refund Completed</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Your refund has been successfully processed!</p>
            
            <div class="info-box">
              <p><strong>Return Number:</strong> ${returnNumber}</p>
              <p><strong>Refund Amount:</strong> ₹${refundAmount.toFixed(2)}</p>
            </div>
            
            <p>The refund will be credited to your original payment method within 5-7 business days.</p>
            <p>Thank you for shopping with Kangana Silks!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
