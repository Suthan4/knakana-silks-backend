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
   * ✅ NEW: Validate and apply coupon
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

    // Check if active
    if (!coupon.isActive) {
      throw new Error("Coupon is not active");
    }

    // Check validity dates
    const now = new Date();
    if (now < coupon.validFrom) {
      throw new Error("Coupon is not yet valid");
    }
    if (now > coupon.validUntil) {
      throw new Error("Coupon has expired");
    }

    // Check max usage
    if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
      throw new Error("Coupon usage limit exceeded");
    }

    // Check per-user limit
    if (coupon.perUserLimit) {
      const userUsageCount = await this.couponRepository.getUserUsageCount(
        coupon.id,
        BigInt(userId)
      );
      if (userUsageCount >= coupon.perUserLimit) {
        throw new Error("You have already used this coupon maximum times");
      }
    }

    // Check scope validity
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

    // Check user eligibility
    const userIdBigInt = BigInt(userId);
    const isEligible = await this.couponRepository.isUserEligible(
      coupon.id,
      userIdBigInt
    );

    if (!isEligible && coupon.userEligibility !== "ALL") {
      throw new Error("You are not eligible for this coupon");
    }

    // Calculate subtotal for eligible items only
    let eligibleSubtotal = 0;

    if (coupon.scope === "ALL") {
      // All items are eligible
      eligibleSubtotal = orderItems.reduce((sum, item) => {
        const price = item.variant
          ? Number(item.variant.price)
          : Number(item.product.sellingPrice);
        return sum + price * item.quantity;
      }, 0);
    } else if (coupon.scope === "CATEGORY") {
      // Only items from specific categories
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
      // Only specific products
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

    // Check minimum order value
    if (eligibleSubtotal < Number(coupon.minOrderValue)) {
      throw new Error(
        `Minimum order value of ₹${coupon.minOrderValue} required`
      );
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (eligibleSubtotal * Number(coupon.discountValue)) / 100;
    } else {
      discount = Number(coupon.discountValue);
    }

    // Apply max discount cap
    if (coupon.maxDiscountAmount) {
      discount = Math.min(discount, Number(coupon.maxDiscountAmount));
    }

    // Ensure discount doesn't exceed eligible subtotal
    discount = Math.min(discount, eligibleSubtotal);

    return {
      coupon,
      discount: Math.round(discount * 100) / 100,
    };
  }

  /**
   * ✅ UPDATED: Calculate order breakdown with GST and coupon
   */
  private calculateOrderBreakdown(params: {
    subtotal: number;
    couponDiscount: number;
    shippingCost: number;
  }): OrderBreakdown {
    const { subtotal, couponDiscount, shippingCost } = params;

    // Taxable amount = subtotal - coupon discount + shipping
    const taxableAmount = subtotal - couponDiscount + shippingCost;

    // GST on taxable amount
    const gstAmount = taxableAmount * this.GST_RATE;

    // Total includes GST
    const total = taxableAmount + gstAmount;

    return {
      subtotal,
      discount: couponDiscount, // For backward compatibility
      shippingCost,
      gstAmount: Math.round(gstAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
      couponDiscount,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
    };
  }

// BACKEND FIX: src/modules/order/application/service/order.service.ts
// This is the critical fix for the getOrderPreview method

/**
 * ✅ UPDATED: Get order preview with coupon support
 */
// async getOrderPreview(
//   userId: string,
//   data: {
//     shippingAddressId: string;
//     couponCode?: string;
//     items?: Array<{
//       productId: string;
//       variantId?: string;
//       quantity: number;
//     }>;
//   }
// ) {
//   const userIdBigInt = BigInt(userId);
//   const isBuyNow = !!data.items?.length;

//   console.log("📦 getOrderPreview called with:", {
//     userId,
//     couponCode: data.couponCode,
//     isBuyNow,
//     itemsCount: data.items?.length
//   });

//   // 1. Get items (Buy Now or Cart)
//   let orderItems: any[] = [];
//   if (isBuyNow) {
//     orderItems = await this.orderRepository.getOrderItemsFromBuyNow(
//       data.items!
//     );
//     if (!orderItems || orderItems.length === 0) {
//       throw new Error("Buy now items not found");
//     }
//   } else {
//     const cart = await this.cartRepository.getCartWithItems(userIdBigInt);
//     if (!cart || cart.items.length === 0) {
//       throw new Error("Cart is empty");
//     }
//     orderItems = cart.items;
//   }

//   // 2. Validate address
//   const address = await this.addressRepository.findById(
//     BigInt(data.shippingAddressId)
//   );
//   if (!address || address.userId !== userIdBigInt) {
//     throw new Error("Invalid shipping address");
//   }

//   // 3. Calculate subtotal
//   let subtotal = 0;
//   for (const item of orderItems) {
//     const price = item.variant
//       ? Number(item.variant.price)
//       : Number(item.product.sellingPrice);
//     subtotal += price * item.quantity;
//   }

//   console.log("💰 Calculated subtotal:", subtotal);

//   // 4. Calculate shipping cost
//   const shippingCost = this.calculateShippingCost(subtotal);

//   // 5. ✅ Apply coupon if provided
//   let couponDiscount = 0;
//   let appliedCoupon: any = null;
//   let couponError: string | undefined;

//   if (data.couponCode) {
//     console.log("🎟️ Attempting to apply coupon:", data.couponCode);
    
//     try {
//       const couponResult = await this.validateAndApplyCoupon(
//         data.couponCode,
//         userId,
//         orderItems
//       );
      
//       couponDiscount = couponResult.discount;
//       appliedCoupon = {
//         id: couponResult.coupon.id.toString(),
//         code: couponResult.coupon.code,
//         description: couponResult.coupon.description,
//         discountType: couponResult.coupon.discountType,
//         discountValue: Number(couponResult.coupon.discountValue),
//         minOrderValue: Number(couponResult.coupon.minOrderValue),
//         maxDiscountAmount: couponResult.coupon.maxDiscountAmount
//           ? Number(couponResult.coupon.maxDiscountAmount)
//           : null,
//         scope: couponResult.coupon.scope,
//         userEligibility: couponResult.coupon.userEligibility,
//         validFrom: couponResult.coupon.validFrom,
//         validUntil: couponResult.coupon.validUntil,
//         isActive: couponResult.coupon.isActive,
//       };

//       console.log("✅ Coupon applied successfully:", {
//         code: appliedCoupon.code,
//         discount: couponDiscount
//       });
//     } catch (error: any) {
//       // ✅ CRITICAL FIX: Return error but don't throw
//       // This allows preview to continue without coupon
//       couponError = error.message;
//       console.log("❌ Coupon validation failed:", error.message);
      
//       // Still return preview without discount
//       couponDiscount = 0;
//       appliedCoupon = null;
//     }
//   }

//   // 6. Calculate breakdown with GST
//   const breakdown = this.calculateOrderBreakdown({
//     subtotal,
//     couponDiscount,
//     shippingCost,
//   });

//   // console.log("📊 Final breakdown:", {
//   //   subtotal: breakdown.subtotal,
//   //   couponDiscount: breakdown.couponDiscount,
//   //   shippingCost: breakdown.shippingCost,
//   //   gstAmount: breakdown.gstAmount,
//   //   total: breakdown.total
//   // });

//   return {
//     breakdown,
//     estimatedDelivery: "3-5 business days",
//     itemCount: orderItems.length,
//     isServiceable: true,
//     appliedCoupon,
//     couponError, // ✅ Return error to frontend
//   };
// }

/**
 * ✅ FIXED: Get order preview with proper subtotal calculation
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

  console.log("📦 getOrderPreview called with:", {
    userId,
    couponCode: data.couponCode,
    isBuyNow,
    itemsCount: data.items?.length
  });

  // 1. Get items (Buy Now or Cart)
  let orderItems: any[] = [];
  if (isBuyNow) {
    orderItems = await this.orderRepository.getOrderItemsFromBuyNow(
      data.items!
    );
    if (!orderItems || orderItems.length === 0) {
      throw new Error("Buy now items not found");
    }
  } else {
    // ✅ CART MODE - Get cart with items
    const cart = await this.cartRepository.getCartWithItems(userIdBigInt);
    if (!cart || cart.items.length === 0) {
      throw new Error("Cart is empty");
    }
    orderItems = cart.items;
  }

  // Right after getting order items (around line 480)
console.log("🛒 Order items structure:", {
  itemCount: orderItems.length,
  firstItem: orderItems[0] ? {
    productId: orderItems[0].productId,
    categoryId: orderItems[0].product?.categoryId, // ✅ Should now be present
    variantId: orderItems[0].variantId,
    quantity: orderItems[0].quantity,
    productPrice: orderItems[0].product?.sellingPrice,
    variantPrice: orderItems[0].variant?.sellingPrice, // ✅ Should now be present
  } : null
});

  // 2. Validate address
  const address = await this.addressRepository.findById(
    BigInt(data.shippingAddressId)
  );
  if (!address || address.userId !== userIdBigInt) {
    throw new Error("Invalid shipping address");
  }

  // 3. ✅ CRITICAL FIX: Calculate subtotal with detailed logging
  let subtotal = 0;
  for (const item of orderItems) {
    // Determine the correct price to use
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

    console.log(`💰 Item calculation:`, {
      productName: item.product?.name,
      price: itemPrice,
      quantity: item.quantity,
      itemSubtotal,
      runningSubtotal: subtotal
    });
  }

  console.log("💰 Final subtotal calculated:", {
    subtotal,
    mode: isBuyNow ? "BuyNow" : "Cart",
    itemCount: orderItems.length
  });

  // 4. Calculate shipping cost
  const shippingCost = this.calculateShippingCost(subtotal);

  // 5. ✅ Apply coupon if provided
  let couponDiscount = 0;
  let appliedCoupon: any = null;
  let couponError: string | undefined;

  if (data.couponCode) {
    console.log("🎟️ Attempting to apply coupon:", data.couponCode, "to subtotal:", subtotal);
    
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

      console.log("✅ Coupon applied successfully:", {
        code: appliedCoupon.code,
        discountAmount: couponDiscount,
        subtotalBefore: subtotal,
        subtotalAfter: subtotal - couponDiscount
      });
    } catch (error: any) {
      couponError = error.message;
      console.log("❌ Coupon validation failed:", error.message);
      couponDiscount = 0;
      appliedCoupon = null;
    }
  }

  // 6. Calculate breakdown with GST
  const breakdown = this.calculateOrderBreakdown({
    subtotal,
    couponDiscount,
    shippingCost,
  });

  console.log("📊 Final breakdown:", {
    subtotal: breakdown.subtotal,
    couponDiscount: breakdown.couponDiscount,
    shippingCost: breakdown.shippingCost,
    taxableAmount: breakdown.taxableAmount,
    gstAmount: breakdown.gstAmount,
    total: breakdown.total
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
   * ✅ UPDATED: Create order with coupon support
   */
  async createOrder(
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

    // 1. Get items source (Cart OR Buy Now)
    let cart: any = null;
    let orderItems: any[] = [];

    if (isBuyNow) {
      orderItems = await this.orderRepository.getOrderItemsFromBuyNow(
        data.items!
      );
      if (!orderItems || orderItems.length === 0) {
        throw new Error("Buy now items not found");
      }
      console.log(`🛒 Buy Now mode: ${orderItems.length} item(s)`);
    } else {
      cart = await this.cartRepository.getCartWithItems(userIdBigInt);
      if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }
      orderItems = cart.items;
      console.log(`🛒 Cart mode: ${orderItems.length} item(s)`);
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

    // 3. Get pickup warehouse
    const pickupWarehouse = await this.getPickupWarehouse();
    console.log(`📦 Pickup warehouse: ${pickupWarehouse.name}`);

    // 4. Calculate shipping dimensions
    const shippingDimensions = this.calculateShippingDimensions(orderItems);

    // 5. Calculate subtotal
    let subtotal = 0;
    for (const item of orderItems) {
      const price = item.variant
        ? Number(item.variant.price)
        : Number(item.product.sellingPrice);
      subtotal += price * item.quantity;
    }

    // 6. Calculate shipping cost
    const shippingCost = this.calculateShippingCost(subtotal);

    // 7. ✅ Apply coupon if provided
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

      console.log(`🎟️ Coupon applied: ${data.couponCode} (-₹${couponDiscount})`);
    }

    // 8. Calculate order breakdown WITH GST and coupon
    const breakdown = this.calculateOrderBreakdown({
      subtotal,
      couponDiscount,
      shippingCost,
    });

    console.log("💰 Order Breakdown:", {
      subtotal: `₹${breakdown.subtotal}`,
      couponDiscount: `₹${breakdown.couponDiscount}`,
      shipping: `₹${breakdown.shippingCost}`,
      taxableAmount: `₹${breakdown.taxableAmount}`,
      gst: `₹${breakdown.gstAmount}`,
      total: `₹${breakdown.total}`,
    });

    // 9. Generate unique order number
    const orderNumber = NumberUtil.generateOrderNumber();

    // 10. Create address snapshots
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

    // 11. Create order with GST and coupon
    const order = await this.orderRepository.create({
      userId: userIdBigInt,
      orderNumber,
      status: OrderStatus.PENDING,
      subtotal: breakdown.subtotal,
      discount: breakdown.couponDiscount, // ✅ Coupon discount
      shippingCost: breakdown.shippingCost,
      gstAmount: breakdown.gstAmount,
      total: breakdown.total,
      shippingAddressId: BigInt(data.shippingAddressId),
      billingAddressId: BigInt(data.billingAddressId),
      shippingAddressSnapshot,
      billingAddressSnapshot,
      couponId, // ✅ Store coupon reference
    });

    // 12. ✅ Increment coupon usage if applied
    if (couponId) {
      await this.couponRepository.incrementUsage(couponId);
      console.log(`✅ Coupon usage incremented: ${appliedCoupon.code}`);
    }

    // 13. Create OrderShippingInfo
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

    // 14. Add order items
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

    // 15. Create Razorpay order with TOTAL (including GST)
    const razorpayOrder = await this.razorpayService.createOrder({
      amount: Math.round(breakdown.total * 100), // Total WITH GST in paise
      currency: "INR",
      receipt: orderNumber,
      notes: {
        orderId: order.id.toString(),
        userId: userId,
        warehouse: pickupWarehouse.name,
        chargeableWeight: shippingDimensions.chargeableWeight.toString(),
        subtotal: breakdown.subtotal.toString(),
        couponDiscount: breakdown.couponDiscount.toString(),
        couponCode: appliedCoupon?.code || "",
        shipping: breakdown.shippingCost.toString(),
        gst: breakdown.gstAmount.toString(),
        total: breakdown.total.toString(),
      },
    });

    // 16. Create payment record
    await this.paymentRepository.create({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      method: data.paymentMethod,
      status: PaymentStatus.PENDING,
      amount: breakdown.total,
    });

    // 17. Clear cart ONLY for cart checkout
    if (!isBuyNow && cart) {
      await this.cartRepository.clearCart(cart.id);
      console.log("🛒 Cart cleared");
    }

    // 18. Get complete order details
    const completeOrder = await this.orderRepository.findById(order.id);

    console.log(`✅ Order created: ${orderNumber}`);
    console.log(
      `💳 Razorpay amount: ₹${breakdown.total} (incl. GST ₹${breakdown.gstAmount})`
    );

    return {
      order: completeOrder,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amountInPaise: Math.round(breakdown.total * 100),
      breakdown: {
        subtotal: breakdown.subtotal,
        discount: breakdown.couponDiscount,
        couponDiscount: breakdown.couponDiscount,
        shippingCost: breakdown.shippingCost,
        gstAmount: breakdown.gstAmount,
        taxableAmount: breakdown.taxableAmount,
        total: breakdown.total,
      },
      appliedCoupon: appliedCoupon
        ? {
            code: appliedCoupon.code,
            discount: breakdown.couponDiscount,
          }
        : null,
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
    const isValid = this.razorpayService.verifyPaymentSignature(params);

    if (!isValid) {
      throw new Error("Invalid payment signature");
    }

    const payment = await this.paymentRepository.findByRazorpayOrderId(
      params.razorpay_order_id
    );

    if (!payment) {
      throw new Error("Payment not found");
    }

    await this.paymentRepository.update(payment.id, {
      razorpayPaymentId: params.razorpay_payment_id,
      status: PaymentStatus.SUCCESS,
    });

    await this.orderRepository.update(payment.orderId, {
      status: OrderStatus.PROCESSING,
    });

    const order = await this.orderRepository.findById(payment.orderId);

    if (!order) {
      throw new Error("Order not found after payment");
    }

    console.log(`✅ Payment verified for order: ${order.orderNumber}`);

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

    return order;
  }

  // ... (rest of the methods remain the same: cancelOrder, canCancelOrder, getUserOrders, etc.)
  // Copy from previous order.service.updated.ts

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

    // ✅ Decrement coupon usage if coupon was used
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