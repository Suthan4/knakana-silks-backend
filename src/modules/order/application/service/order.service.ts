import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "../../infrastructure/interface/Iorderrepository.js";
import { ICartRepository } from "@/modules/cart/infrastructure/interface/Icartrepository.js";
import { IPaymentRepository } from "@/modules/payment/infrastructure/interface/Ipaymentrepository.js";
import { IShipmentRepository } from "@/modules/shipment/presentation/repository/shipmentRepository.js";
import { RazorpayService } from "@/modules/payment/application/service/razorpay.service.js";
import { ShiprocketService } from "@/modules/shipment/application/service/shiprocket.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { NumberUtil } from "@/shared/utils/index.js";
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from "@/generated/prisma/enums.js";

@injectable()
export class OrderService {
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("ICartRepository") private cartRepository: ICartRepository,
    @inject("IPaymentRepository") private paymentRepository: IPaymentRepository,
    @inject("IShipmentRepository") private shipmentRepository: IShipmentRepository,
    @inject(RazorpayService) private razorpayService: RazorpayService,
    @inject(ShiprocketService) private shiprocketService: ShiprocketService,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * Create order from cart
   */
  async createOrder(
    userId: string,
    data: {
      shippingAddressId: string;
      billingAddressId: string;
      couponCode?: string;
      paymentMethod: PaymentMethod;
    }
  ) {
    const userIdBigInt = BigInt(userId);

    // Get cart with items
    const cart = await this.cartRepository.getCartWithItems(userIdBigInt);
    if (!cart || cart.items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Calculate totals
    let subtotal = 0;
    for (const item of cart.items) {
      const price = item.variant
        ? Number(item.variant.price)
        : Number(item.product.sellingPrice);
      subtotal += price * item.quantity;
    }

    const shippingCost = this.calculateShippingCost(subtotal);
    let discount = 0;
    let couponId: bigint | undefined;

    // Apply coupon if provided
    if (data.couponCode) {
      // TODO: Validate and apply coupon
    }

    const total = subtotal + shippingCost - discount;

    // Generate order number
    const orderNumber = NumberUtil.generateOrderNumber();

    // Create order
    const order = await this.orderRepository.create({
      userId: userIdBigInt,
      orderNumber,
      status: OrderStatus.PENDING,
      subtotal,
      discount,
      shippingCost,
      total,
      shippingAddressId: BigInt(data.shippingAddressId),
      billingAddressId: BigInt(data.billingAddressId),
      couponId,
    });

    // Add order items
    for (const item of cart.items) {
      const price = item.variant
        ? Number(item.variant.price)
        : Number(item.product.sellingPrice);

      await this.orderRepository.addItem({
        orderId: order.id,
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        quantity: item.quantity,
        price,
      });
    }

    // Create Razorpay order
    const razorpayOrder = await this.razorpayService.createOrder({
      amount: Math.round(total * 100), // Convert to paise
      currency: "INR",
      receipt: orderNumber,
      notes: {
        orderId: order.id.toString(),
        userId: userId,
      },
    });

    // Create payment record
    await this.paymentRepository.create({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      method: data.paymentMethod,
      status: PaymentStatus.PENDING,
      amount: total,
    });

    // Clear cart
    await this.cartRepository.clearCart(cart.id);

    // Get complete order details
    const completeOrder = await this.orderRepository.findById(order.id);

    return {
      order: completeOrder,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    };
  }

  /**
   * Verify payment and update order
   */
  async verifyPayment(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    // Verify signature
    const isValid = this.razorpayService.verifyPaymentSignature(params);

    if (!isValid) {
      throw new Error("Invalid payment signature");
    }

    // Find payment
    const payment = await this.paymentRepository.findByRazorpayOrderId(
      params.razorpay_order_id
    );

    if (!payment) {
      throw new Error("Payment not found");
    }

    // Update payment
    await this.paymentRepository.update(payment.id, {
      razorpayPaymentId: params.razorpay_payment_id,
      status: PaymentStatus.SUCCESS,
    });

    // Update order status
    await this.orderRepository.update(payment.orderId, {
      status: OrderStatus.PROCESSING,
    });

    // Get complete order
    return this.orderRepository.findById(payment.orderId);
  }

  /**
   * Cancel order with proper conditions
   *
   * CANCELLATION CONDITIONS:
   * 1. Only allowed if order status is PENDING or PROCESSING
   * 2. NOT allowed if order is SHIPPED, DELIVERED, COMPLETED, or already CANCELLED
   * 3. If shipment is created in Shiprocket, cancel it first
   * 4. Refund only if payment was successful
   * 5. Check time window (e.g., within 24 hours of order placement)
   */
  async cancelOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    // Verify user owns the order
    if (order.userId !== BigInt(userId)) {
      throw new Error("Unauthorized: You can only cancel your own orders");
    }

    // ===== CANCELLATION CONDITIONS =====

    // Condition 1: Check order status
    if (order.status === OrderStatus.CANCELLED) {
      throw new Error("Order is already cancelled");
    }

    if (order.status === OrderStatus.COMPLETED) {
      throw new Error("Completed orders cannot be cancelled");
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new Error(
        "Delivered orders cannot be cancelled. Please raise a return request instead"
      );
    }

    if (order.status === OrderStatus.SHIPPED) {
      throw new Error(
        "Order has been shipped and cannot be cancelled. Please reject the shipment upon delivery or raise a return request"
      );
    }

    // Condition 2: Check time window (24 hours from order creation)
    const ORDER_CANCELLATION_WINDOW_HOURS = 24;
    const orderAge = Date.now() - order.createdAt.getTime();
    const maxCancellationTime =
      ORDER_CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;

    if (
      order.status === OrderStatus.PROCESSING &&
      orderAge > maxCancellationTime
    ) {
      throw new Error(
        `Order can only be cancelled within ${ORDER_CANCELLATION_WINDOW_HOURS} hours of placement`
      );
    }

    // Condition 3: Check if shipment exists in Shiprocket
    let shiprocketCancelled = false;
    if (order.shipment && order.shipment.shiprocketOrderId) {
      try {
        // Cancel in Shiprocket first
        await this.shiprocketService.cancelShipment([
          parseInt(order.shipment.shiprocketOrderId),
        ]);
        shiprocketCancelled = true;
        console.log(
          `✅ Shiprocket order cancelled: ${order.shipment.shiprocketOrderId}`
        );
      } catch (error) {
        console.error("Failed to cancel Shiprocket shipment:", error);
        // Continue with order cancellation even if Shiprocket fails
        // Admin can manually handle in Shiprocket dashboard
      }
    }

    // Update order status to CANCELLED
    await this.orderRepository.update(order.id, {
      status: OrderStatus.CANCELLED,
    });

    // Condition 4: Process refund if payment was successful
    let refundProcessed = false;
    if (order.payment && order.payment.status === PaymentStatus.SUCCESS) {
      try {
        await this.refundPayment(order.payment.id);
        refundProcessed = true;
        console.log(`✅ Refund processed for order: ${order.orderNumber}`);
      } catch (error) {
        console.error("Refund processing failed:", error);
        // Update payment status to indicate refund pending
        await this.paymentRepository.update(order.payment.id, {
          status: PaymentStatus.PENDING, // Will be retried
        });
      }
    }

    // Send cancellation email
    try {
      await this.emailService.sendOrderCancellation({
        email: order.user.email,
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        reason: reason || "Customer requested cancellation",
        refundAmount: refundProcessed ? Number(order.total) : 0,
        refundStatus: refundProcessed
          ? "Refund will be processed in 5-7 business days"
          : "Refund pending",
      });
    } catch (error) {
      console.error("Failed to send cancellation email:", error);
    }

    // Get updated order
    const updatedOrder = await this.orderRepository.findById(order.id);

    return {
      order: updatedOrder,
      shiprocketCancelled,
      refundProcessed,
      message: "Order cancelled successfully",
    };
  }

  /**
   * Check if order can be cancelled
   * This helps frontend show/hide cancel button
   */
  async canCancelOrder(
    userId: string,
    orderId: string
  ): Promise<{
    canCancel: boolean;
    reason?: string;
  }> {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      return { canCancel: false, reason: "Order not found" };
    }

    if (order.userId !== BigInt(userId)) {
      return { canCancel: false, reason: "Unauthorized" };
    }

    // Check status
    if (order.status === OrderStatus.CANCELLED) {
      return { canCancel: false, reason: "Order is already cancelled" };
    }

    if (order.status === OrderStatus.COMPLETED) {
      return {
        canCancel: false,
        reason: "Completed orders cannot be cancelled",
      };
    }

    if (order.status === OrderStatus.DELIVERED) {
      return {
        canCancel: false,
        reason: "Please raise a return request for delivered orders",
      };
    }

    if (order.status === OrderStatus.SHIPPED) {
      return {
        canCancel: false,
        reason:
          "Order has been shipped. Reject upon delivery or raise return request",
      };
    }

    // Check time window
    const ORDER_CANCELLATION_WINDOW_HOURS = 24;
    const orderAge = Date.now() - order.createdAt.getTime();
    const maxCancellationTime =
      ORDER_CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;

    if (
      order.status === OrderStatus.PROCESSING &&
      orderAge > maxCancellationTime
    ) {
      return {
        canCancel: false,
        reason: `Cancellation window of ${ORDER_CANCELLATION_WINDOW_HOURS} hours has passed`,
      };
    }

    return { canCancel: true };
  }

  /**
   * Get user orders
   */
  async getUserOrders(
    userId: string,
    params: {
      page: number;
      limit: number;
      status?: OrderStatus;
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

    const [orders, total] = await Promise.all([
      this.orderRepository.findByUserId(BigInt(userId), {
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.orderRepository.countByUserId(BigInt(userId), where),
    ]);

    return {
      orders,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Get order by ID (with permission check)
   */
  async getOrder(userId: string, orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    // Verify user owns the order
    if (order.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return order;
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(userId: string, orderNumber: string) {
    const order = await this.orderRepository.findByOrderNumber(orderNumber);

    if (!order) {
      throw new Error("Order not found");
    }

    // Verify user owns the order
    if (order.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return order;
  }

  /**
   * Admin: Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    await this.orderRepository.update(order.id, { status });

    return this.orderRepository.findById(order.id);
  }

  /**
   * Admin: Get all orders
   */
  async getAllOrders(params: {
    page: number;
    limit: number;
    status?: OrderStatus;
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

    const [orders, total] = await Promise.all([
      this.orderRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.orderRepository.count(where),
    ]);

    return {
      orders,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Calculate shipping cost
   */
  private calculateShippingCost(subtotal: number): number {
    // Free shipping above 1000
    if (subtotal >= 1000) {
      return 0;
    }
    // Flat 50 for orders below 1000
    return 50;
  }

  /**
   * Refund payment
   */
  private async refundPayment(paymentId: bigint) {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      return;
    }

    if (!payment.razorpayPaymentId) {
      return;
    }

    try {
      await this.razorpayService.refundPayment(
        payment.razorpayPaymentId,
        Math.round(Number(payment.amount) * 100)
      );

      await this.paymentRepository.update(payment.id, {
        status: PaymentStatus.REFUNDED,
        refundAmount: payment.amount,
      });
    } catch (error) {
      console.error("Refund failed:", error);
      throw new Error("Failed to process refund");
    }
  }
}
