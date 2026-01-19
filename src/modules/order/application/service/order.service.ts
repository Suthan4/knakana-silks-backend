import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "../../infrastructure/interface/Iorderrepository.js";
import { ICartRepository } from "@/modules/cart/infrastructure/interface/Icartrepository.js";
import { IPaymentRepository } from "@/modules/payment/infrastructure/interface/Ipaymentrepository.js";
import { IAddressRepository } from "@/modules/address/infrastructure/interface/Iaddressrepository.js";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { RazorpayService } from "@/modules/payment/application/service/razorpay.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { NumberUtil } from "@/shared/utils/index.js";
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from "@/generated/prisma/enums.js";
import { IOrderShippingInfoRepository } from "../../infrastructure/interface/Iordershippinginforepository.js";

interface ShippingDimensions {
  totalWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  length: number;
  breadth: number;
  height: number;
}

@injectable()
export class OrderService {
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("ICartRepository") private cartRepository: ICartRepository,
    @inject("IPaymentRepository")
    private paymentRepository: IPaymentRepository,
    @inject("IAddressRepository")
    private addressRepository: IAddressRepository,
    @inject("IWarehouseRepository")
    private warehouseRepository: IWarehouseRepository,
    @inject("IOrderShippingInfoRepository")
    private orderShippingInfoRepository: IOrderShippingInfoRepository,
    @inject(RazorpayService) private razorpayService: RazorpayService,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * Calculate volumetric weight: (L × B × H) / 5000
   */
  private calculateVolumetricWeight(
    length: number,
    breadth: number,
    height: number
  ): number {
    return (length * breadth * height) / 5000;
  }

  /**
   * Calculate shipping dimensions for order
   * Combines weights and dimensions from all order items
   */
  private calculateShippingDimensions(items: any[]): ShippingDimensions {
    let totalWeight = 0;
    let maxLength = 0;
    let maxBreadth = 0;
    let totalHeight = 0;

    for (const item of items) {
      const quantity = item.quantity;

      // Get weight - priority: variant > product > default (0.5kg)
      let weight = 0.5; // Default weight
      if (item.variant?.weight) {
        weight = Number(item.variant.weight);
      } else if (item.product?.weight) {
        weight = Number(item.product.weight);
      }

      // Get dimensions - priority: variant > product > defaults
      let length = 35; // Default length in cm
      let breadth = 25; // Default breadth in cm
      let height = 5; // Default height in cm

      if (item.variant) {
        length = item.variant.length ? Number(item.variant.length) : length;
        breadth = item.variant.breadth ? Number(item.variant.breadth) : breadth;
        height = item.variant.height ? Number(item.variant.height) : height;
      } else if (item.product) {
        length = item.product.length ? Number(item.product.length) : length;
        breadth = item.product.breadth ? Number(item.product.breadth) : breadth;
        height = item.product.height ? Number(item.product.height) : height;
      }

      // Calculate totals
      totalWeight += weight * quantity;
      maxLength = Math.max(maxLength, length);
      maxBreadth = Math.max(maxBreadth, breadth);
      totalHeight += height * quantity; // Stack items vertically
    }

    // Calculate volumetric weight
    const volumetricWeight = this.calculateVolumetricWeight(
      maxLength,
      maxBreadth,
      totalHeight
    );

    // Chargeable weight is the higher of actual or volumetric
    const chargeableWeight = Math.max(totalWeight, volumetricWeight);

    return {
      totalWeight: Math.round(totalWeight * 1000) / 1000, // Round to 3 decimals
      volumetricWeight: Math.round(volumetricWeight * 1000) / 1000,
      chargeableWeight: Math.round(chargeableWeight * 1000) / 1000,
      length: Math.ceil(maxLength),
      breadth: Math.ceil(maxBreadth),
      height: Math.ceil(totalHeight),
    };
  }

  /**
   * Get default pickup warehouse for shipments
   */
  private async getPickupWarehouse() {
    // Try to get warehouse marked as default pickup
    const defaultWarehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isDefaultPickup: true, isActive: true },
    });

    if (defaultWarehouses.length > 0) {
      return defaultWarehouses[0];
    }

    // Fallback to any active warehouse
    const activeWarehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isActive: true },
    });

    if (activeWarehouses.length === 0) {
      throw new Error(
        "No active warehouse found. Please configure a warehouse first."
      );
    }

    return activeWarehouses[0];
  }

  /**
   * Create order from cart with weight calculation and shipping info
   */
  async createOrder(
  userId: string,
  data: {
    shippingAddressId: string;
    billingAddressId: string;
    couponCode?: string;
    paymentMethod: PaymentMethod;

    // ✅ BUY NOW ITEMS SUPPORT
    items?: Array<{
      productId: string;
      variantId?: string;
      quantity: number;
    }>;
  }
) {
  const userIdBigInt = BigInt(userId);
  const isBuyNow = !!data.items?.length;

  // 1. Get items source (Cart OR BuyNow)
  let cart: any = null;
  let orderItems: any[] = [];

  if (isBuyNow) {
    // ✅ BUY NOW FLOW
    orderItems = await this.orderRepository.getOrderItemsFromBuyNow(data.items!);

    if (!orderItems || orderItems.length === 0) {
      throw new Error("Buy now item not found");
    }
  } else {
    // ✅ CART FLOW
    cart = await this.cartRepository.getCartWithItems(userIdBigInt);

    if (!cart || cart.items.length === 0) {
      throw new Error("Cart is empty");
    }

    orderItems = cart.items;
  }

  // 2. Validate addresses exist and belong to user
  const [shippingAddress, billingAddress] = await Promise.all([
    this.addressRepository.findById(BigInt(data.shippingAddressId)),
    this.addressRepository.findById(BigInt(data.billingAddressId)),
  ]);

  if (!shippingAddress || shippingAddress.userId !== userIdBigInt) {
    throw new Error("Invalid shipping address");
  }

  if (!billingAddress || billingAddress.userId !== userIdBigInt) {
    throw new Error("Invalid billing address");
  }

  // 3. Get pickup warehouse (for shipment creation)
  const pickupWarehouse = await this.getPickupWarehouse();
  console.log(`📦 Pickup warehouse selected: ${pickupWarehouse.name}`);

  // 4. Calculate shipping dimensions and weights ✅ (use orderItems)
  const shippingDimensions = this.calculateShippingDimensions(orderItems);

  console.log("📏 Shipping Dimensions:", {
    totalWeight: `${shippingDimensions.totalWeight}kg`,
    volumetricWeight: `${shippingDimensions.volumetricWeight}kg`,
    chargeableWeight: `${shippingDimensions.chargeableWeight}kg`,
    dimensions: `${shippingDimensions.length} × ${shippingDimensions.breadth} × ${shippingDimensions.height} cm`,
  });

  // 5. Calculate order totals ✅ (use orderItems)
  let subtotal = 0;
  for (const item of orderItems) {
    const price = item.variant
      ? Number(item.variant.price)
      : Number(item.product.sellingPrice);

    subtotal += price * item.quantity;
  }

  const shippingCost = this.calculateShippingCost(subtotal);
  let discount = 0;
  let couponId: bigint | undefined;

  // 6. Apply coupon if provided (TODO: Implement coupon validation)
  if (data.couponCode) {
    // Future: Validate and apply coupon logic
  }

  const total = subtotal + shippingCost - discount;

  // 7. Generate unique order number
  const orderNumber = NumberUtil.generateOrderNumber();

  // 8. Create address snapshots for historical record
  const shippingAddressSnapshot = {
    fullName: shippingAddress.fullName,
    phone: shippingAddress.phone,
    addressLine1: shippingAddress.addressLine1,
    addressLine2: shippingAddress.addressLine2,
    city: shippingAddress.city,
    state: shippingAddress.state,
    pincode: shippingAddress.pincode,
    country: shippingAddress.country,
  };

  const billingAddressSnapshot = {
    fullName: billingAddress.fullName,
    phone: billingAddress.phone,
    addressLine1: billingAddress.addressLine1,
    addressLine2: billingAddress.addressLine2,
    city: billingAddress.city,
    state: billingAddress.state,
    pincode: billingAddress.pincode,
    country: billingAddress.country,
  };

  // 9. Create order
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
    shippingAddressSnapshot,
    billingAddressSnapshot,
    couponId,
  });

  // 10. Create OrderShippingInfo record
  await this.orderShippingInfoRepository.create({
    orderId: order.id,
    warehouseId: pickupWarehouse.id,
    warehouseName: pickupWarehouse.name,
    warehouseCode: pickupWarehouse.code,
    pickupAddress: pickupWarehouse.address,
    pickupAddressLine2: pickupWarehouse.addressLine2,
    pickupCity: pickupWarehouse.city,
    pickupState: pickupWarehouse.state,
    pickupPincode: pickupWarehouse.pincode,
    pickupCountry: pickupWarehouse.country || "India",
    pickupPhone: pickupWarehouse.phone,
    pickupEmail: pickupWarehouse.email,
    pickupContactPerson: pickupWarehouse.contactPerson,
    totalWeight: shippingDimensions.totalWeight,
    volumetricWeight: shippingDimensions.volumetricWeight,
    chargeableWeight: shippingDimensions.chargeableWeight,
    length: shippingDimensions.length,
    breadth: shippingDimensions.breadth,
    height: shippingDimensions.height,
  });

  console.log(`✅ Shipping info created for order: ${orderNumber}`);

  // 11. Add order items ✅ (use orderItems)
  for (const item of orderItems) {
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

  // 12. Create Razorpay order
  const razorpayOrder = await this.razorpayService.createOrder({
    amount: Math.round(total * 100), // Convert to paise
    currency: "INR",
    receipt: orderNumber,
    notes: {
      orderId: order.id.toString(),
      userId: userId,
      warehouse: pickupWarehouse.name,
      chargeableWeight: shippingDimensions.chargeableWeight.toString(),
    },
  });

  // 13. Create payment record
  await this.paymentRepository.create({
    orderId: order.id,
    razorpayOrderId: razorpayOrder.id,
    method: data.paymentMethod,
    status: PaymentStatus.PENDING,
    amount: total,
  });

  // 14. Clear cart ONLY for cart checkout ✅
  if (!isBuyNow && cart) {
    await this.cartRepository.clearCart(cart.id);
  }

  // 15. Get complete order details with shipping info
  const completeOrder = await this.orderRepository.findById(order.id);

  console.log(`✅ Order created: ${orderNumber}`);
  console.log(`📦 Chargeable weight: ${shippingDimensions.chargeableWeight}kg`);
  console.log(`🏢 Pickup from: ${pickupWarehouse.name}, ${pickupWarehouse.city}`);

  return {
    order: completeOrder,
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    shippingInfo: {
      warehouse: {
        name: pickupWarehouse.name,
        city: pickupWarehouse.city,
        pincode: pickupWarehouse.pincode,
      },
      dimensions: shippingDimensions,
    },
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
    // 1. Verify signature
    const isValid = this.razorpayService.verifyPaymentSignature(params);

    if (!isValid) {
      throw new Error("Invalid payment signature");
    }

    // 2. Find payment by Razorpay order ID
    const payment = await this.paymentRepository.findByRazorpayOrderId(
      params.razorpay_order_id
    );

    if (!payment) {
      throw new Error("Payment not found");
    }

    // 3. Update payment status
    await this.paymentRepository.update(payment.id, {
      razorpayPaymentId: params.razorpay_payment_id,
      status: PaymentStatus.SUCCESS,
    });

    // 4. Update order status to PROCESSING
    await this.orderRepository.update(payment.orderId, {
      status: OrderStatus.PROCESSING,
    });

    // 5. Get complete order details with shipping info
    const order = await this.orderRepository.findById(payment.orderId);

    if (!order) {
      throw new Error("Order not found after payment");
    }

    // 6. Log that order is ready for shipment
    console.log(`✅ Payment verified for order: ${order.orderNumber}`);
    console.log(`📦 Order ready for shipment creation`);
    
    if (order.shippingInfo) {
      console.log(`🏢 Pickup: ${order.shippingInfo.warehouseName}`);
      console.log(`⚖️ Weight: ${order.shippingInfo.chargeableWeight}kg`);
    }

    // 7. Send order confirmation email
    try {
      await this.emailService.sendOrderConfirmation({
        email: order.user.email,
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        orderTotal: Number(order.total),
        orderItems: order.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: Number(item.price),
        })),
      });
    } catch (error) {
      console.error("Failed to send order confirmation email:", error);
    }

    // 8. TODO: Create Shiprocket shipment automatically
    // This is where you'll integrate shipment creation:
    // const shippingInfo = order.shippingInfo;
    // await this.shipmentService.createShipment(order.id.toString(), shippingInfo);

    return order;
  }

  /**
   * Get shipping info for order (useful for Shiprocket integration)
   */
  async getOrderShippingInfo(orderId: string) {
    const shippingInfo = await this.orderShippingInfoRepository.findByOrderId(
      BigInt(orderId)
    );

    if (!shippingInfo) {
      throw new Error("Shipping info not found for this order");
    }

    return shippingInfo;
  }

  /**
   * Cancel order
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

    // ===== CANCELLATION VALIDATION =====

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

    // Check time window (24 hours from order creation)
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

    // ===== PERFORM CANCELLATION =====

    // Update order status to CANCELLED
    await this.orderRepository.update(order.id, {
      status: OrderStatus.CANCELLED,
    });

    // Process refund if payment was successful
    let refundProcessed = false;
    if (order.payment && order.payment.status === PaymentStatus.SUCCESS) {
      try {
        await this.refundPayment(order.payment.id);
        refundProcessed = true;
        console.log(`✅ Refund processed for order: ${order.orderNumber}`);
      } catch (error) {
        console.error("Refund processing failed:", error);
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

    const updatedOrder = await this.orderRepository.findById(order.id);

    return {
      order: updatedOrder,
      refundProcessed,
      message: "Order cancelled successfully",
    };
  }

  /**
   * Check if order can be cancelled
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
   * Get user orders with pagination and filtering
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

    try {
      if (status === OrderStatus.SHIPPED) {
        await this.emailService.sendShippingNotification({
          email: order.user.email,
          firstName: order.user.firstName,
          orderNumber: order.orderNumber,
        });
      } else if (status === OrderStatus.DELIVERED) {
        await this.emailService.sendDeliveryConfirmation({
          email: order.user.email,
          firstName: order.user.firstName,
          orderNumber: order.orderNumber,
        });
      }
    } catch (error) {
      console.error("Failed to send status update email:", error);
    }

    return this.orderRepository.findById(order.id);
  }

  /**
   * Admin: Get all orders with pagination and filtering
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
    if (subtotal >= 1000) {
      return 0;
    }
    return 50;
  }

  /**
   * Refund payment via Razorpay
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