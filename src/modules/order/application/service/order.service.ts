import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "../../infrastructure/interface/Iorderrepository.js";
import { ICartRepository } from "@/modules/cart/infrastructure/interface/Icartrepository.js";
import { IPaymentRepository } from "@/modules/payment/infrastructure/interface/Ipaymentrepository.js";
import { IAddressRepository } from "@/modules/address/infrastructure/interface/Iaddressrepository.js";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { ICouponRepository } from "@/modules/coupon/infrastructure/interface/Icouponrepository.js";
import { RazorpayService } from "@/modules/payment/application/service/razorpay.service.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";
import { NumberUtil } from "@/shared/utils/index.js";
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  DiscountType,
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

interface OrderBreakdown {
  subtotal: number;
  discount: number;
  shippingCost: number;
  gstAmount: number;
  total: number;
  couponDiscount: number;
  taxableAmount: number;
}

interface CartItem {
  productId: string;
  categoryId?: string;
  quantity: number;
  price: number;
}

@injectable()
export class OrderService {
  // Constants
  private readonly GST_RATE = 0.18; // 18%
  private readonly FREE_SHIPPING_THRESHOLD = 1000;
  private readonly DEFAULT_SHIPPING_COST = 50;

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
    @inject("ICouponRepository")
    private couponRepository: ICouponRepository,
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
   */
  private calculateShippingDimensions(items: any[]): ShippingDimensions {
    let totalWeight = 0;
    let maxLength = 0;
    let maxBreadth = 0;
    let totalHeight = 0;

    for (const item of items) {
      const quantity = item.quantity;

      let weight = 0.5;
      if (item.variant?.weight) {
        weight = Number(item.variant.weight);
      } else if (item.product?.weight) {
        weight = Number(item.product.weight);
      }

      let length = 35;
      let breadth = 25;
      let height = 5;

      if (item.variant) {
        length = item.variant.length ? Number(item.variant.length) : length;
        breadth = item.variant.breadth ? Number(item.variant.breadth) : breadth;
        height = item.variant.height ? Number(item.variant.height) : height;
      } else if (item.product) {
        length = item.product.length ? Number(item.product.length) : length;
        breadth = item.product.breadth ? Number(item.product.breadth) : breadth;
        height = item.product.height ? Number(item.product.height) : height;
      }

      totalWeight += weight * quantity;
      maxLength = Math.max(maxLength, length);
      maxBreadth = Math.max(maxBreadth, breadth);
      totalHeight += height * quantity;
    }

    const volumetricWeight = this.calculateVolumetricWeight(
      maxLength,
      maxBreadth,
      totalHeight
    );

    const chargeableWeight = Math.max(totalWeight, volumetricWeight);

    return {
      totalWeight: Math.round(totalWeight * 1000) / 1000,
      volumetricWeight: Math.round(volumetricWeight * 1000) / 1000,
      chargeableWeight: Math.round(chargeableWeight * 1000) / 1000,
      length: Math.ceil(maxLength),
      breadth: Math.ceil(maxBreadth),
      height: Math.ceil(totalHeight),
    };
  }

  /**
   * Get default pickup warehouse
   */
  private async getPickupWarehouse() {
    const defaultWarehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isDefaultPickup: true, isActive: true },
    });

    if (defaultWarehouses.length > 0) {
      return defaultWarehouses[0];
    }

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
   * Calculate shipping cost based on subtotal
   */
  private calculateShippingCost(subtotal: number): number {
    if (subtotal >= this.FREE_SHIPPING_THRESHOLD) {
      return 0;
    }
    return this.DEFAULT_SHIPPING_COST;
  }

  /**
   * Validate and apply coupon
   */
  private async validateAndApplyCoupon(
    couponCode: string,
    userId: string,
    orderItems: any[]
  ): Promise<{
    coupon: any;
    discount: number;
  }> {
    const coupon = await this.couponRepository.findByCode(
      couponCode.toUpperCase()
    );

    if (!coupon) {
      throw new Error("Invalid coupon code");
    }

    if (!coupon.isActive) {
      throw new Error("Coupon is not active");
    }

    const now = new Date();
    if (now < coupon.validFrom) {
      throw new Error("Coupon is not yet valid");
    }
    if (now > coupon.validUntil) {
      throw new Error("Coupon has expired");
    }

    if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
      throw new Error("Coupon usage limit exceeded");
    }

    if (coupon.perUserLimit) {
      const userUsageCount = await this.couponRepository.getUserUsageCount(
        coupon.id,
        BigInt(userId)
      );
      if (userUsageCount >= coupon.perUserLimit) {
        throw new Error("You have already used this coupon maximum times");
      }
    }

    const productIds = orderItems.map((item) => item.productId);
    const categoryIds = orderItems
      .filter((item) => item.product?.categoryId)
      .map((item) => item.product.categoryId);

    const scopeValid = await this.couponRepository.isScopeValid(
      coupon.id,
      productIds,
      categoryIds
    );

    if (!scopeValid) {
      throw new Error("This coupon is not applicable to items in your cart");
    }

    const userIdBigInt = BigInt(userId);
    const isEligible = await this.couponRepository.isUserEligible(
      coupon.id,
      userIdBigInt
    );

    if (!isEligible && coupon.userEligibility !== "ALL") {
      throw new Error("You are not eligible for this coupon");
    }

    let eligibleSubtotal = 0;

    if (coupon.scope === "ALL") {
      eligibleSubtotal = orderItems.reduce((sum, item) => {
        const price = item.variant
          ? Number(item.variant.price)
          : Number(item.product.sellingPrice);
        return sum + price * item.quantity;
      }, 0);
    } else if (coupon.scope === "CATEGORY") {
      const couponCategoryIds = coupon.categories.map((c) => c.id);
      eligibleSubtotal = orderItems
        .filter((item) =>
          couponCategoryIds.includes(item.product?.categoryId)
        )
        .reduce((sum, item) => {
          const price = item.variant
            ? Number(item.variant.price)
            : Number(item.product.sellingPrice);
          return sum + price * item.quantity;
        }, 0);
    } else if (coupon.scope === "PRODUCT") {
      const couponProductIds = coupon.products.map((p) => p.id);
      eligibleSubtotal = orderItems
        .filter((item) => couponProductIds.includes(item.productId))
        .reduce((sum, item) => {
          const price = item.variant
            ? Number(item.variant.price)
            : Number(item.product.sellingPrice);
          return sum + price * item.quantity;
        }, 0);
    }

    if (eligibleSubtotal < Number(coupon.minOrderValue)) {
      throw new Error(
        `Minimum order value of ₹${coupon.minOrderValue} required`
      );
    }

    let discount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (eligibleSubtotal * Number(coupon.discountValue)) / 100;
    } else {
      discount = Number(coupon.discountValue);
    }

    if (coupon.maxDiscountAmount) {
      discount = Math.min(discount, Number(coupon.maxDiscountAmount));
    }

    discount = Math.min(discount, eligibleSubtotal);

    return {
      coupon,
      discount: Math.round(discount * 100) / 100,
    };
  }

  /**
   * Calculate order breakdown with GST and coupon
   */
  private calculateOrderBreakdown(params: {
    subtotal: number;
    couponDiscount: number;
    shippingCost: number;
  }): OrderBreakdown {
    const { subtotal, couponDiscount, shippingCost } = params;

    const taxableAmount = subtotal - couponDiscount + shippingCost;
    const gstAmount = taxableAmount * this.GST_RATE;
    const total = taxableAmount + gstAmount;

    return {
      subtotal,
      discount: couponDiscount,
      shippingCost,
      gstAmount: Math.round(gstAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
      couponDiscount,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
    };
  }

  /**
   * Get order preview
   */
  async getOrderPreview(
    userId: string,
    data: {
      shippingAddressId: string;
      couponCode?: string;
      items?: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
      }>;
    }
  ) {
    const userIdBigInt = BigInt(userId);
    const isBuyNow = !!data.items?.length;

    let orderItems: any[] = [];
    if (isBuyNow) {
      orderItems = await this.orderRepository.getOrderItemsFromBuyNow(
        data.items!
      );
      if (!orderItems || orderItems.length === 0) {
        throw new Error("Buy now items not found");
      }
    } else {
      const cart = await this.cartRepository.getCartWithItems(userIdBigInt);
      if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }
      orderItems = cart.items;
    }

    const address = await this.addressRepository.findById(
      BigInt(data.shippingAddressId)
    );
    if (!address || address.userId !== userIdBigInt) {
      throw new Error("Invalid shipping address");
    }

    let subtotal = 0;
    for (const item of orderItems) {
      let itemPrice = 0;
      if (item.variant?.sellingPrice) {
        itemPrice = Number(item.variant.sellingPrice);
      } else if (item.variant?.price) {
        itemPrice = Number(item.variant.price);
      } else if (item.product?.sellingPrice) {
        itemPrice = Number(item.product.sellingPrice);
      } else {
        throw new Error("Product price not found");
      }
      const itemSubtotal = itemPrice * item.quantity;
      subtotal += itemSubtotal;
    }

    const shippingCost = this.calculateShippingCost(subtotal);

    let couponDiscount = 0;
    let appliedCoupon: any = null;
    let couponError: string | undefined;

    if (data.couponCode) {
      try {
        const couponResult = await this.validateAndApplyCoupon(
          data.couponCode,
          userId,
          orderItems
        );
        
        couponDiscount = couponResult.discount;
        appliedCoupon = {
          id: couponResult.coupon.id.toString(),
          code: couponResult.coupon.code,
          description: couponResult.coupon.description,
          discountType: couponResult.coupon.discountType,
          discountValue: Number(couponResult.coupon.discountValue),
          minOrderValue: Number(couponResult.coupon.minOrderValue),
          maxDiscountAmount: couponResult.coupon.maxDiscountAmount
            ? Number(couponResult.coupon.maxDiscountAmount)
            : null,
          scope: couponResult.coupon.scope,
          userEligibility: couponResult.coupon.userEligibility,
          validFrom: couponResult.coupon.validFrom,
          validUntil: couponResult.coupon.validUntil,
          isActive: couponResult.coupon.isActive,
        };
      } catch (error: any) {
        couponError = error.message;
        couponDiscount = 0;
        appliedCoupon = null;
      }
    }

    const breakdown = this.calculateOrderBreakdown({
      subtotal,
      couponDiscount,
      shippingCost,
    });

    return {
      breakdown,
      estimatedDelivery: "3-5 business days",
      itemCount: orderItems.length,
      isServiceable: true,
      appliedCoupon,
      couponError,
    };
  }

  /**
   * ✅ STEP 1: Initiate payment (NO order created yet)
   */
  async initiatePayment(
    userId: string,
    data: {
      shippingAddressId: string;
      billingAddressId: string;
      couponCode?: string;
      paymentMethod: PaymentMethod;
      items?: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
      }>;
    }
  ) {
    const userIdBigInt = BigInt(userId);
    const isBuyNow = !!data.items?.length;

    // 1. Get items
    let orderItems: any[] = [];
    if (isBuyNow) {
      orderItems = await this.orderRepository.getOrderItemsFromBuyNow(
        data.items!
      );
      if (!orderItems || orderItems.length === 0) {
        throw new Error("Buy now items not found");
      }
    } else {
      const cart = await this.cartRepository.getCartWithItems(userIdBigInt);
      if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }
      orderItems = cart.items;
    }

    // 2. Validate addresses
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

    // 3. Calculate totals
    let subtotal = 0;
    for (const item of orderItems) {
      const price = item.variant
        ? Number(item.variant.price)
        : Number(item.product.sellingPrice);
      subtotal += price * item.quantity;
    }

    const shippingCost = this.calculateShippingCost(subtotal);

    // 4. Apply coupon
    let couponDiscount = 0;
    let couponId: bigint | undefined;
    let appliedCoupon: any = null;

    if (data.couponCode) {
      const couponResult = await this.validateAndApplyCoupon(
        data.couponCode,
        userId,
        orderItems
      );
      couponDiscount = couponResult.discount;
      couponId = couponResult.coupon.id;
      appliedCoupon = couponResult.coupon;
    }

    const breakdown = this.calculateOrderBreakdown({
      subtotal,
      couponDiscount,
      shippingCost,
    });

    // 5. Generate order number
    const orderNumber = NumberUtil.generateOrderNumber();

    // 6. ✅ Create Razorpay payment session (NO DB order yet!)
    const razorpayOrder = await this.razorpayService.createOrder({
      amount: Math.round(breakdown.total * 100),
      currency: "INR",
      receipt: orderNumber,
      notes: {
        userId: userId,
        shippingAddressId: data.shippingAddressId,
        billingAddressId: data.billingAddressId,
        couponCode: appliedCoupon?.code || "",
        couponId: couponId?.toString() || "",
        isBuyNow: isBuyNow.toString(),
        items: isBuyNow ? JSON.stringify(data.items) : "",
        subtotal: breakdown.subtotal.toString(),
        discount: breakdown.couponDiscount.toString(),
        shipping: breakdown.shippingCost.toString(),
        gst: breakdown.gstAmount.toString(),
        total: breakdown.total.toString(),
      },
    });

    console.log(`✅ Payment session created: ${razorpayOrder.id}`);

    return {
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amountInPaise: Math.round(breakdown.total * 100),
      breakdown,
      orderNumber,
    };
  }

  /**
   * ✅ STEP 2: Create order AFTER successful payment
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

    // 2. Get payment metadata
    const razorpayOrderDetails = await this.razorpayService.fetchOrder(
      params.razorpay_order_id
    );

    const notes = razorpayOrderDetails.notes as any;
    const userId = notes.userId;
    const userIdBigInt = BigInt(userId);
    const isBuyNow = notes.isBuyNow === "true";

    // 3. Re-fetch items
    let cart: any = null;
    let orderItems: any[] = [];

    if (isBuyNow) {
      const buyNowItems = JSON.parse(notes.items);
      orderItems = await this.orderRepository.getOrderItemsFromBuyNow(
        buyNowItems
      );
    } else {
      cart = await this.cartRepository.getCartWithItems(userIdBigInt);
      if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }
      orderItems = cart.items;
    }

    // 4. Re-validate addresses
    const [shippingAddress, billingAddress] = await Promise.all([
      this.addressRepository.findById(BigInt(notes.shippingAddressId)),
      this.addressRepository.findById(BigInt(notes.billingAddressId)),
    ]);

    if (!shippingAddress || shippingAddress.userId !== userIdBigInt) {
      throw new Error("Invalid shipping address");
    }
    if (!billingAddress || billingAddress.userId !== userIdBigInt) {
      throw new Error("Invalid billing address");
    }

    // 5. Get warehouse
    const pickupWarehouse = await this.getPickupWarehouse();

    // 6. Calculate dimensions
    const shippingDimensions = this.calculateShippingDimensions(orderItems);

    // 7. Create address snapshots
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

    // 8. ✅ NOW create the order
    const order = await this.orderRepository.create({
      userId: userIdBigInt,
      orderNumber: razorpayOrderDetails.receipt || NumberUtil.generateOrderNumber(),
      status: OrderStatus.PROCESSING, // ✅ Directly to PROCESSING
      subtotal: Number(notes.subtotal),
      discount: Number(notes.discount),
      shippingCost: Number(notes.shipping),
      gstAmount: Number(notes.gst),
      total: Number(notes.total),
      shippingAddressId: BigInt(notes.shippingAddressId),
      billingAddressId: BigInt(notes.billingAddressId),
      shippingAddressSnapshot,
      billingAddressSnapshot,
      couponId: notes.couponId ? BigInt(notes.couponId) : undefined,
    });

    // 9. Increment coupon usage
    if (notes.couponId) {
      await this.couponRepository.incrementUsage(BigInt(notes.couponId));
    }

    // 10. Create shipping info
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

    // 11. Add order items
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

    // 12. Fetch payment details to get actual payment method and additional info
    const paymentDetails = await this.razorpayService.fetchPayment(
      params.razorpay_payment_id
    );

    // Map Razorpay payment method to your enum
    let paymentMethod: PaymentMethod = "CARD"; // default
    
    if (paymentDetails.method === "card") {
      paymentMethod = "CARD";
    } else if (paymentDetails.method === "upi") {
      paymentMethod = "UPI";
    } else if (paymentDetails.method === "netbanking") {
      paymentMethod = "NETBANKING";
    } else if (paymentDetails.method === "wallet") {
      paymentMethod = "WALLET";
    } else if (paymentDetails.method === "emi") {
      paymentMethod = "EMI";
    } else if (paymentDetails.method === "paylater") {
      paymentMethod = "PAYLATER";
    }

    console.log(`💳 Payment method used: ${paymentDetails.method} → ${paymentMethod}`);

    // 13. ✅ Build payment record with all details
    const paymentRecord: any = {
      orderId: order.id,
      razorpayOrderId: params.razorpay_order_id,
      razorpayPaymentId: params.razorpay_payment_id,
      method: paymentMethod,
      status: PaymentStatus.SUCCESS,
      amount: Number(notes.total),
    };

    // ✅ Add card details if payment was by card
    if (paymentDetails.method === "card" && paymentDetails.card) {
      paymentRecord.cardNetwork = paymentDetails.card.network || null;    // "Visa", "Mastercard", "RuPay"
      paymentRecord.cardLast4 = paymentDetails.card.last4 || null;        // "1234"
      paymentRecord.cardType = paymentDetails.card.type || null;          // "credit" or "debit"
      
      console.log(`💳 Card details: ${paymentDetails.card.network} **** ${paymentDetails.card.last4} (${paymentDetails.card.type})`);
    }

    // ✅ Add UPI ID if payment was by UPI
    if (paymentDetails.method === "upi" && paymentDetails.vpa) {
      paymentRecord.upiId = paymentDetails.vpa;  // "user@paytm"
      console.log(`📱 UPI ID: ${paymentDetails.vpa}`);
    }

    // ✅ Add bank name if payment was by netbanking or card
    if (paymentDetails.bank) {
      paymentRecord.bankName = paymentDetails.bank;  // "HDFC Bank", "ICICI Bank", etc.
      console.log(`🏦 Bank: ${paymentDetails.bank}`);
    }

    // ✅ Add wallet name if payment was by wallet
    if (paymentDetails.method === "wallet" && paymentDetails.wallet) {
      paymentRecord.walletName = paymentDetails.wallet;  // "paytm", "mobikwik", etc.
      console.log(`👛 Wallet: ${paymentDetails.wallet}`);
    }

    // 14. Create payment record with all captured details
    await this.paymentRepository.create(paymentRecord);

    // 15. Clear cart
    if (!isBuyNow && cart) {
      await this.cartRepository.clearCart(cart.id);
    }

    // 16. Get complete order
    const completeOrder = await this.orderRepository.findById(order.id);

    console.log(`✅ Order created after payment: ${order.orderNumber}`);

    // 17. Send email
    try {
      await this.emailService.sendOrderConfirmation({
        email: completeOrder!.user.email,
        firstName: completeOrder!.user.firstName,
        orderNumber: completeOrder!.orderNumber,
        orderTotal: Number(completeOrder!.total),
        orderItems: completeOrder!.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: Number(item.price),
        })),
      });
    } catch (error) {
      console.error("Failed to send order confirmation email:", error);
    }

    return completeOrder;
  }

  // ... (rest of your methods like cancelOrder, getUserOrders, etc remain the same)
  async getOrderShippingInfo(orderId: string) {
    const shippingInfo = await this.orderShippingInfoRepository.findByOrderId(
      BigInt(orderId)
    );

    if (!shippingInfo) {
      throw new Error("Shipping info not found for this order");
    }

    return shippingInfo;
  }

  async cancelOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId !== BigInt(userId)) {
      throw new Error("Unauthorized: You can only cancel your own orders");
    }

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

    await this.orderRepository.update(order.id, {
      status: OrderStatus.CANCELLED,
    });

    if (order.couponId) {
      try {
        const coupon = await this.couponRepository.findById(order.couponId);
        if (coupon && coupon.usageCount > 0) {
          await this.couponRepository.update(order.couponId, {
            usageCount: coupon.usageCount - 1,
          });
          console.log(`✅ Coupon usage decremented: ${coupon.code}`);
        }
      } catch (error) {
        console.error("Failed to decrement coupon usage:", error);
      }
    }

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