import { injectable, inject } from "tsyringe";
import { IReturnRepository } from "../../infrastructure/interface/Ireturnrepository.js";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { IPaymentRepository } from "@/modules/payment/infrastructure/interface/Ipaymentrepository.js";
import { ShiprocketService } from "@/modules/shipment/infrastructure/services/shiprocket.service.js";
import { RazorpayService } from "@/modules/payment/application/service/razorpay.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import {
  ReturnReason,
  ReturnStatus,
  RefundMethod,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/enums.js";
import { Prisma } from "@/generated/prisma/client.js";
import { StockManagementService } from "@/modules/stock/application/stock.management.service.js";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";

interface ReturnEligibility {
  eligible: boolean;
  reason?: string;
  returnWindowHours: number;
  deliveredAt?: Date;
  hoursRemaining?: number;
  daysRemaining?: number;
}

@injectable()
export class ReturnService {
  // ✅ CRITICAL: 24-hour return window after delivery
  private readonly RETURN_WINDOW_HOURS = 24;

  // ✅ Free return reasons (customer not at fault - no shipping deduction)
  private readonly FREE_RETURN_REASONS: ReturnReason[] = [
    ReturnReason.DEFECTIVE,
    ReturnReason.WRONG_ITEM,
    ReturnReason.NOT_AS_DESCRIBED,
    ReturnReason.DAMAGED_IN_TRANSIT,
  ];

  constructor(
    @inject("IReturnRepository") private returnRepository: IReturnRepository,
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("IPaymentRepository") private paymentRepository: IPaymentRepository,
    @inject(ShiprocketService) private shiprocketService: ShiprocketService,
    @inject(RazorpayService) private razorpayService: RazorpayService,
    @inject(EmailService) private emailService: EmailService,
    @inject(StockManagementService) private stockManagementService: StockManagementService,
    @inject("IWarehouseRepository") private warehouseRepository: IWarehouseRepository  
  ) {}

  /**
   * ✅ Check if order is eligible for return (24-hour window enforcement)
   * This is called BEFORE showing the return button to the user
   */
  async checkReturnEligibility(
    userId: string,
    orderId: string
  ): Promise<ReturnEligibility> {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      return {
        eligible: false,
        reason: "Order not found",
        returnWindowHours: this.RETURN_WINDOW_HOURS,
      };
    }

    // ✅ Verify ownership
    if (order.userId !== BigInt(userId)) {
      return {
        eligible: false,
        reason: "Unauthorized",
        returnWindowHours: this.RETURN_WINDOW_HOURS,
      };
    }

    // ✅ CRITICAL: Must be delivered (not pending, processing, shipped, or cancelled)
    if (order.status !== OrderStatus.DELIVERED) {
      return {
        eligible: false,
        reason: "Order must be delivered before initiating a return",
        returnWindowHours: this.RETURN_WINDOW_HOURS,
      };
    }

    // ✅ Check delivery date exists
    if (!order.shipment?.deliveredAt) {
      return {
        eligible: false,
        reason: "Delivery date not available",
        returnWindowHours: this.RETURN_WINDOW_HOURS,
      };
    }

    // ✅ CRITICAL: Check 24-hour window
    const deliveredAt = new Date(order.shipment.deliveredAt);
    const now = new Date();
    const hoursSinceDelivery =
      (now.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceDelivery > this.RETURN_WINDOW_HOURS) {
      return {
        eligible: false,
        reason: `Return window has expired. Returns must be initiated within ${this.RETURN_WINDOW_HOURS} hours of delivery.`,
        returnWindowHours: this.RETURN_WINDOW_HOURS,
        deliveredAt,
        hoursRemaining: 0,
        daysRemaining: 0,
      };
    }

    // ✅ Check for existing active returns
    const existingReturns = await this.returnRepository.findAll({
      skip: 0,
      take: 1,
      where: {
        orderId: order.id,
        status: {
          notIn: [ReturnStatus.REJECTED, ReturnStatus.CLOSED],
        },
      },
    });

    if (existingReturns.length > 0) {
      return {
        eligible: false,
        reason: "A return request is already in progress for this order",
        returnWindowHours: this.RETURN_WINDOW_HOURS,
        deliveredAt,
        hoursRemaining: 0,
      };
    }

    // ✅ ELIGIBLE: Return window is still open
    const hoursRemaining = Math.max(
      0,
      this.RETURN_WINDOW_HOURS - hoursSinceDelivery
    );

    return {
      eligible: true,
      returnWindowHours: this.RETURN_WINDOW_HOURS,
      deliveredAt,
      hoursRemaining: Math.floor(hoursRemaining * 10) / 10, // Round to 1 decimal
      daysRemaining: Math.floor((hoursRemaining / 24) * 10) / 10,
    };
  }

  /**
   * ✅ Calculate reverse shipping cost using Shiprocket (for paid returns only)
   */
  private async calculateReverseShippingCost(order: any): Promise<number> {
    if (!order.shippingInfo) {
      console.warn("⚠️ No shipping info found, using default reverse shipping cost");
      return 50; // Default fallback
    }

    try {
      // ✅ Get reverse logistics quote (from customer to warehouse)
      const couriers = await this.shiprocketService.getAvailableCouriers({
        pickupPostcode: order.shippingAddress.pincode, // Customer location (pickup)
        deliveryPostcode: order.shippingInfo.pickupPincode, // Warehouse (delivery)
        weight: order.shippingInfo.chargeableWeight,
        cod: 0, // No COD for returns
      });

      if (
        couriers.data?.available_courier_companies &&
        couriers.data.available_courier_companies.length > 0
      ) {
        // ✅ Get cheapest courier for reverse shipping
        const cheapest = couriers.data.available_courier_companies.reduce(
          (prev: any, curr: any) =>
            curr.freight_charge < prev.freight_charge ? curr : prev
        );
        console.log(
          `📦 Reverse shipping cost: ₹${cheapest.freight_charge} (${cheapest.courier_name})`
        );
        return cheapest.freight_charge;
      }
    } catch (error) {
      console.error("❌ Shiprocket reverse logistics quote failed:", error);
    }

    console.warn("⚠️ Using default reverse shipping cost");
    return 50; // Default fallback
  }

  /**
   * ✅ Create return request with smart refund calculation
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
      images?: string[];
      refundMethod: RefundMethod;
      bankDetails?: any;
    }
  ) {
    // ✅ CRITICAL: Check eligibility first
    const eligibility = await this.checkReturnEligibility(userId, data.orderId);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Order not eligible for return");
    }

    const order = await this.orderRepository.findById(BigInt(data.orderId));
    if (!order) throw new Error("Order not found");

    // ✅ Validate order items
    const orderItemIds = order.items.map((item) => item.id);
    const requestedItemIds = data.orderItems.map((item) =>
      BigInt(item.orderItemId)
    );

    for (const itemId of requestedItemIds) {
      if (!orderItemIds.includes(itemId)) {
        throw new Error("Invalid order item in return request");
      }
    }

    // ✅ Check if items already have returns
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

    // ✅ Calculate items refund
    const totalOrderAmount = Number(order.total);
    const totalOrderItems = order.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const returnItemsCount = data.orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    let itemsRefund = 0;
    for (const item of data.orderItems) {
      const orderItem = order.items.find(
        (oi) => oi.id === BigInt(item.orderItemId)
      );
      if (orderItem) {
        itemsRefund += Number(orderItem.price) * item.quantity;
      }
    }

    // ✅ CRITICAL: Proportional shipping refund
    const shippingRefund =
      (Number(order.shippingCost) * returnItemsCount) / totalOrderItems;

    let refundAmount = itemsRefund + shippingRefund;

    // ✅ CRITICAL: Determine if free return or paid return
    const primaryReason = data.orderItems[0]?.reason;
    const isFreeReturn = this.FREE_RETURN_REASONS.includes(primaryReason);

    if (!isFreeReturn) {
      // ✅ PAID RETURN: Deduct reverse shipping cost
      try {
        const reverseShippingCost = await this.calculateReverseShippingCost(
          order
        );
        console.log(
          `💰 Return type: PAID (deducting ₹${reverseShippingCost} reverse shipping)`
        );
        refundAmount = Math.max(0, refundAmount - reverseShippingCost);
      } catch (error) {
        console.error("Failed to calculate reverse shipping:", error);
        const defaultReverseShipping = 50;
        refundAmount = Math.max(0, refundAmount - defaultReverseShipping);
      }
    } else {
      console.log(`🎁 Return type: FREE (no shipping charges deducted)`);
    }

    // ✅ Validate bank details for BANK_TRANSFER
    if (
      data.refundMethod === RefundMethod.BANK_TRANSFER &&
      (!data.bankDetails ||
        !data.bankDetails.accountNumber ||
        !data.bankDetails.ifscCode ||
        !data.bankDetails.accountHolderName)
    ) {
      throw new Error(
        "Bank details are required for bank transfer refund method"
      );
    }

    // ✅ Generate return number
    const returnNumber = this.generateReturnNumber();

    // ✅ Create return
    const returnRequest = await this.returnRepository.create({
      returnNumber,
      userId: BigInt(userId),
      orderId: order.id,
      reason: primaryReason ?? ReturnReason.OTHER,
      reasonDetails: data.reasonDetails,
      images: data.images || [],
      status: ReturnStatus.PENDING,
      refundAmount,
      refundMethod: data.refundMethod,
      bankDetails: data.bankDetails,
    });

    // ✅ Add return items
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

    console.log(
      `✅ Return created: ${returnNumber} (Free: ${isFreeReturn}, Refund: ₹${refundAmount.toFixed(2)})`
    );

    // ✅ Send email
    try {
      await this.emailService.sendEmail({
        to: order.user.email,
        subject: `Return Request Submitted - ${returnNumber}`,
        html: this.getReturnRequestEmailTemplate(
          order.user.firstName,
          returnNumber,
          refundAmount,
          isFreeReturn
        ),
      });
    } catch (error) {
      console.error("Failed to send return request email:", error);
    }

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Admin: Approve return and create Shiprocket reverse order
   */
  async approveReturn(returnId: string, adminNotes?: string) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new Error("Only pending returns can be approved");
    }

    const order = returnRequest.order;

    // ✅ Create return order in Shiprocket for reverse logistics
    try {
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
        shippingCustomerName:
          order.shippingInfo?.warehouseName || "Warehouse",
        shippingAddress:
          order.shippingInfo?.pickupAddress ||
          process.env.WAREHOUSE_ADDRESS ||
          "",
        shippingCity:
          order.shippingInfo?.pickupCity || process.env.WAREHOUSE_CITY || "",
        shippingPincode:
          order.shippingInfo?.pickupPincode ||
          process.env.WAREHOUSE_PINCODE ||
          "",
        shippingState:
          order.shippingInfo?.pickupState ||
          process.env.WAREHOUSE_STATE ||
          "",
        shippingCountry: "India",
        shippingEmail: process.env.WAREHOUSE_EMAIL || "",
        shippingPhone:
          order.shippingInfo?.pickupPhone ||
          process.env.WAREHOUSE_PHONE ||
          "",
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

      // ✅ Create return shipment record
      const returnShipment = await this.returnRepository.createReturnShipment({
        shiprocketOrderId: shiprocketOrder.order_id.toString(),
        awb: shiprocketOrder.shipment_id?.toString() || "",
        courierName: "Pending",
        pickupDate: new Date(),
        status: "PICKUP_SCHEDULED",
      });

      // ✅ Link shipment and approve return
      await this.returnRepository.update(returnRequest.id, {
        returnShipmentId: returnShipment.id,
        status: ReturnStatus.APPROVED,
        adminNotes,
      });

      console.log(`✅ Return approved: ${returnRequest.returnNumber}`);
    } catch (error) {
      console.error("Shiprocket return order creation failed:", error);
      // Still approve the return even if Shiprocket fails
      await this.returnRepository.update(returnRequest.id, {
        status: ReturnStatus.APPROVED,
        adminNotes: adminNotes
          ? `${adminNotes}\n\nNote: Shiprocket order creation failed, needs manual handling`
          : "Shiprocket order creation failed, needs manual handling",
      });
    }

    // ✅ Send approval email
    try {
      await this.emailService.sendEmail({
        to: returnRequest.user.email,
        subject: `Return Approved - ${returnRequest.returnNumber}`,
        html: this.getReturnStatusEmailTemplate(
          returnRequest.user.firstName,
          returnRequest.returnNumber,
          ReturnStatus.APPROVED
        ),
      });
    } catch (error) {
      console.error("Failed to send approval email:", error);
    }

    return this.returnRepository.findById(returnRequest.id);
  }

  /**
   * Admin: Reject return
   */
  async rejectReturn(
    returnId: string,
    rejectionReason: string,
    adminNotes?: string
  ) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new Error("Only pending returns can be rejected");
    }

    await this.returnRepository.update(returnRequest.id, {
      status: ReturnStatus.REJECTED,
      rejectionReason,
      adminNotes,
    });

    // ✅ Send rejection email
    try {
      await this.emailService.sendEmail({
        to: returnRequest.user.email,
        subject: `Return Rejected - ${returnRequest.returnNumber}`,
        html: this.getReturnStatusEmailTemplate(
          returnRequest.user.firstName,
          returnRequest.returnNumber,
          ReturnStatus.REJECTED,
          rejectionReason
        ),
      });
    } catch (error) {
      console.error("Failed to send rejection email:", error);
    }

    console.log(`✅ Return rejected: ${returnRequest.returnNumber}`);

    return this.returnRepository.findById(returnRequest.id);
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

  // ✅ CRITICAL: Only restore stock when return is RECEIVED at warehouse
  // NOT when refund is initiated (product might still be in transit)
  if (returnRequest.status !== ReturnStatus.RECEIVED) {
    throw new Error("Return must be received at warehouse before processing refund");
  }

    const payment = await this.paymentRepository.findByOrderId(
      returnRequest.orderId
    );

    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      throw new Error("Original payment not found or not successful");
    }

      // ✅ GET WAREHOUSE (from original order's shipping info)
  const order = returnRequest.order;
  let warehouseId: bigint;

  if (order.shippingInfo?.warehouseId) {
    warehouseId = order.shippingInfo.warehouseId;
  } else {
    // Fallback to default warehouse
    const warehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isDefaultPickup: true, isActive: true },
    });
    if (warehouses.length === 0) {
      throw new Error("No active warehouse found for stock restoration");
    }
    warehouseId = warehouses[0].id;
  }

  // ✅ RESTORE STOCK (add items back to inventory)
  try {
    await this.stockManagementService.restoreStockForReturn(
      returnRequest.returnItems,
      warehouseId,
      returnRequest.returnNumber
    );
    console.log(`✅ Stock restored for return ${returnRequest.returnNumber}`);
  } catch (error) {
    console.error("❌ Stock restoration failed:", error);
    // Don't fail the refund, but log for manual intervention
  }

    // ✅ Process refund based on method
    if (returnRequest.refundMethod === RefundMethod.ORIGINAL_PAYMENT) {
      if (!payment.razorpayPaymentId) {
        throw new Error("Razorpay payment ID not found");
      }

      const refundResponse = await this.razorpayService.refundPayment(
        payment.razorpayPaymentId,
        Math.round(returnRequest.refundAmount * 100)
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
      await this.returnRepository.update(returnRequest.id, {
        status: ReturnStatus.REFUND_INITIATED,
      });
    }

    console.log(
      `✅ Refund initiated: ${returnRequest.returnNumber} (₹${returnRequest.refundAmount})`
    );

    // ✅ Auto-complete after 5 seconds
    setTimeout(async () => {
      try {
        await this.returnRepository.update(returnRequest.id, {
          status: ReturnStatus.REFUND_COMPLETED,
        });

        await this.emailService.sendEmail({
          to: returnRequest.user.email,
          subject: `Refund Completed - ${returnRequest.returnNumber}`,
          html: this.getRefundCompletedEmailTemplate(
            returnRequest.user.firstName,
            returnRequest.returnNumber,
            returnRequest.refundAmount
          ),
        });

        console.log(`✅ Refund completed: ${returnRequest.returnNumber}`);
      } catch (error) {
        console.error("Auto-complete refund failed:", error);
      }
    }, 5000);

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
   * Get return by ID
   */
  async getReturn(userId: string, returnId: string) {
    const returnRequest = await this.returnRepository.findById(
      BigInt(returnId)
    );

    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    if (returnRequest.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return returnRequest;
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
 * ✅ NEW: Update return status to RECEIVED (triggers stock restoration eligibility)
 * Admin should call this when physical product arrives at warehouse
 */
async markReturnAsReceived(returnId: string, adminNotes?: string) {
  const returnRequest = await this.returnRepository.findById(BigInt(returnId));

  if (!returnRequest) {
    throw new Error("Return request not found");
  }

  if (returnRequest.status !== ReturnStatus.PICKED_UP && 
      returnRequest.status !== ReturnStatus.IN_TRANSIT) {
    throw new Error("Return must be picked up or in transit to mark as received");
  }

  // ✅ Update status to RECEIVED
  await this.returnRepository.update(returnRequest.id, {
    status: ReturnStatus.RECEIVED,
    adminNotes: adminNotes || "Product received at warehouse",
  });

  console.log(`✅ Return marked as received: ${returnRequest.returnNumber}`);

  // ✅ Now admin can call processRefund() which will restore stock + issue refund

  return this.returnRepository.findById(returnRequest.id);
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
   * Helper: Email templates
   */
  private getReturnRequestEmailTemplate(
    firstName: string,
    returnNumber: string,
    refundAmount: number,
    isFreeReturn: boolean
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
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .badge-free { background-color: #D1FAE5; color: #065F46; }
          .badge-paid { background-color: #FEF3C7; color: #92400E; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Return Request Submitted</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Your return request has been successfully submitted and is under review.</p>
            
            <div class="info-box">
              <p><strong>Return Number:</strong> ${returnNumber}</p>
              <p><strong>Expected Refund:</strong> ₹${refundAmount.toFixed(2)}</p>
              <p>
                <strong>Return Type:</strong> 
                <span class="badge ${isFreeReturn ? "badge-free" : "badge-paid"}">
                  ${isFreeReturn ? "🎉 FREE RETURN" : "💰 PAID RETURN"}
                </span>
              </p>
              ${
                !isFreeReturn
                  ? '<p style="color: #92400E; font-size: 14px;">⚠️ Reverse shipping charges have been deducted from your refund amount</p>'
                  : '<p style="color: #065F46; font-size: 14px;">✓ No shipping charges deducted - this is a free return</p>'
              }
              <p><strong>Status:</strong> Pending Review</p>
            </div>
            
            <p>We will review your request within 24 hours. Once approved, we'll schedule a pickup.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

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
              <p><strong>Status:</strong> ${status}</p>
              ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ""}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

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
            <p>Thank you for shopping with us!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}