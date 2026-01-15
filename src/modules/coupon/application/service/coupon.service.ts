import { injectable, inject } from "tsyringe";
import { DiscountType } from "@/generated/prisma/enums.js";
import { ICouponRepository } from "../../infrastructure/interface/Icouponrepository.js";
import {
  CouponScope,
  CouponUserEligibility,
} from "../dtos/coupon.dtos.js";
import { Decimal } from "@prisma/client/runtime/client";

interface CartItem {
  productId: string;
  categoryId?: string;
  quantity: number;
  price: number;
}

@injectable()
export class CouponService {
  constructor(
    @inject("ICouponRepository") private couponRepository: ICouponRepository
  ) {}

  async createCoupon(data: {
    code: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    minOrderValue: number;
    maxDiscountAmount?: number;
    scope: CouponScope;
    categoryIds?: string[];
    productIds?: string[];
    userEligibility: CouponUserEligibility;
    eligibleUserIds?: string[];
    newUserDays?: number;
    maxUsage?: number;
    perUserLimit?: number;
    validFrom: string;
    validUntil: string;
    isActive: boolean;
  }) {
    // Check if code already exists
    const existing = await this.couponRepository.findByCode(data.code);
    if (existing) {
      throw new Error("Coupon code already exists");
    }

    // Create the coupon
    const coupon = await this.couponRepository.create({
      code: data.code.toUpperCase(),
      description: data.description,
      discountType: data.discountType,
      discountValue: new Decimal(data.discountValue),
      minOrderValue: new Decimal(data.minOrderValue),
      maxDiscountAmount: data.maxDiscountAmount
        ? new Decimal(data.maxDiscountAmount)
        : undefined,
      scope: data.scope,
      userEligibility: data.userEligibility,
      newUserDays: data.newUserDays,
      maxUsage: data.maxUsage,
      perUserLimit: data.perUserLimit,
      validFrom: new Date(data.validFrom),
      validUntil: new Date(data.validUntil),
      isActive: data.isActive,
    });

    // Add scope relations
    if (data.scope === CouponScope.CATEGORY && data.categoryIds) {
      await this.couponRepository.addCategories(
        coupon.id,
        data.categoryIds.map((id) => BigInt(id))
      );
    }

    if (data.scope === CouponScope.PRODUCT && data.productIds) {
      await this.couponRepository.addProducts(
        coupon.id,
        data.productIds.map((id) => BigInt(id))
      );
    }

    // Add eligible users
    if (
      data.userEligibility === CouponUserEligibility.SPECIFIC_USERS &&
      data.eligibleUserIds
    ) {
      await this.couponRepository.addEligibleUsers(
        coupon.id,
        data.eligibleUserIds.map((id) => BigInt(id))
      );
    }

    return this.couponRepository.findById(coupon.id);
  }

  async updateCoupon(
    id: string,
    data: {
      description?: string;
      discountType?: DiscountType;
      discountValue?: number;
      minOrderValue?: number;
      maxDiscountAmount?: number;
      scope?: CouponScope;
      categoryIds?: string[];
      productIds?: string[];
      userEligibility?: CouponUserEligibility;
      eligibleUserIds?: string[];
      newUserDays?: number;
      maxUsage?: number;
      perUserLimit?: number;
      validFrom?: string;
      validUntil?: string;
      isActive?: boolean;
    }
  ) {
    const couponId = BigInt(id);
    const coupon = await this.couponRepository.findById(couponId);

    if (!coupon) {
      throw new Error("Coupon not found");
    }

    // Update basic fields
    const updateData: any = {};
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.discountType !== undefined)
      updateData.discountType = data.discountType;
    if (data.discountValue !== undefined)
      updateData.discountValue = new Decimal(data.discountValue);
    if (data.minOrderValue !== undefined)
      updateData.minOrderValue = new Decimal(data.minOrderValue);
    if (data.maxDiscountAmount !== undefined)
      updateData.maxDiscountAmount = data.maxDiscountAmount
        ? new Decimal(data.maxDiscountAmount)
        : null;
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.userEligibility !== undefined)
      updateData.userEligibility = data.userEligibility;
    if (data.newUserDays !== undefined) updateData.newUserDays = data.newUserDays;
    if (data.maxUsage !== undefined) updateData.maxUsage = data.maxUsage;
    if (data.perUserLimit !== undefined)
      updateData.perUserLimit = data.perUserLimit;
    if (data.validFrom !== undefined)
      updateData.validFrom = new Date(data.validFrom);
    if (data.validUntil !== undefined)
      updateData.validUntil = new Date(data.validUntil);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (Object.keys(updateData).length > 0) {
      await this.couponRepository.update(couponId, updateData);
    }

    // Update category relations
    if (data.categoryIds !== undefined) {
      await this.couponRepository.removeAllCategories(couponId);
      if (data.categoryIds.length > 0) {
        await this.couponRepository.addCategories(
          couponId,
          data.categoryIds.map((id) => BigInt(id))
        );
      }
    }

    // Update product relations
    if (data.productIds !== undefined) {
      await this.couponRepository.removeAllProducts(couponId);
      if (data.productIds.length > 0) {
        await this.couponRepository.addProducts(
          couponId,
          data.productIds.map((id) => BigInt(id))
        );
      }
    }

    // Update eligible users
    if (data.eligibleUserIds !== undefined) {
      await this.couponRepository.removeAllEligibleUsers(couponId);
      if (data.eligibleUserIds.length > 0) {
        await this.couponRepository.addEligibleUsers(
          couponId,
          data.eligibleUserIds.map((id) => BigInt(id))
        );
      }
    }

    return this.couponRepository.findById(couponId);
  }

  async deleteCoupon(id: string) {
    await this.couponRepository.delete(BigInt(id));
  }

  async getCoupon(id: string) {
    const coupon = await this.couponRepository.findById(BigInt(id));
    if (!coupon) {
      throw new Error("Coupon not found");
    }
    return coupon;
  }

  async getCoupons(params: {
    page: number;
    limit: number;
    isActive?: boolean;
    scope?: CouponScope;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }
    if (params.scope) {
      where.scope = params.scope;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [coupons, total] = await Promise.all([
      this.couponRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.couponRepository.count(where),
    ]);

    return {
      coupons,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  // 🆕 NEW: Validate Coupon (for client-side checks)
  async validateCoupon(
    code: string,
    orderAmount: number,
    cartItems: CartItem[],
    userId?: string
  ) {
    const coupon = await this.couponRepository.findByCode(code.toUpperCase());

    if (!coupon) {
      return {
        valid: false,
        error: "Invalid coupon code",
      };
    }

    // Run all validation checks
    const validation = await this.runValidationChecks(
      coupon,
      orderAmount,
      cartItems,
      userId
    );

    if (!validation.valid) {
      return validation;
    }

    // Calculate discount
    const discount = this.calculateDiscount(coupon, orderAmount);

    return {
      valid: true,
      coupon: {
        id: coupon.id.toString(),
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
      },
      discount,
      finalAmount: orderAmount - discount,
    };
  }

  // 🆕 NEW: Apply Coupon (for order creation)
  async applyCoupon(
    code: string,
    orderAmount: number,
    cartItems: CartItem[],
    userId?: string
  ) {
    const coupon = await this.couponRepository.findByCode(code.toUpperCase());

    if (!coupon) {
      throw new Error("Invalid coupon code");
    }

    // Run all validation checks
    const validation = await this.runValidationChecks(
      coupon,
      orderAmount,
      cartItems,
      userId
    );

    if (!validation.valid) {
      throw new Error(validation.error || "Coupon validation failed");
    }

    // Calculate discount
    const discount = this.calculateDiscount(coupon, orderAmount);

    return {
      coupon,
      discount,
      finalAmount: orderAmount - discount,
    };
  }

  // 🆕 NEW: Get Applicable Coupons for User's Cart
  async getApplicableCoupons(
    orderAmount: number,
    cartItems: CartItem[],
    userId?: string
  ) {
    const productIds = cartItems.map((item) => BigInt(item.productId));
    const categoryIds = cartItems
      .filter((item) => item.categoryId)
      .map((item) => BigInt(item.categoryId!));

    const userIdBigInt = userId ? BigInt(userId) : BigInt(0);

    const coupons = await this.couponRepository.findApplicableForUser(
      userIdBigInt,
      productIds,
      categoryIds,
      new Date()
    );

    // Filter and calculate savings for each coupon
    const applicableCoupons = [];

    for (const coupon of coupons) {
      const validation = await this.runValidationChecks(
        coupon,
        orderAmount,
        cartItems,
        userId
      );

      if (validation.valid) {
        const discount = this.calculateDiscount(coupon, orderAmount);
        applicableCoupons.push({
          ...coupon,
          estimatedDiscount: discount,
          estimatedFinalAmount: orderAmount - discount,
        });
      }
    }

    // Sort by highest discount
    return applicableCoupons.sort(
      (a, b) => b.estimatedDiscount - a.estimatedDiscount
    );
  }

  // Helper: Run All Validation Checks
  private async runValidationChecks(
    coupon: any,
    orderAmount: number,
    cartItems: CartItem[],
    userId?: string
  ): Promise<{ valid: boolean; error?: string }> {
    // Check if active
    if (!coupon.isActive) {
      return { valid: false, error: "Coupon is not active" };
    }

    // Check validity dates
    const now = new Date();
    if (now < coupon.validFrom) {
      return { valid: false, error: "Coupon is not yet valid" };
    }
    if (now > coupon.validUntil) {
      return { valid: false, error: "Coupon has expired" };
    }

    // Check minimum order value
    if (orderAmount < Number(coupon.minOrderValue)) {
      return {
        valid: false,
        error: `Minimum order value of ₹${coupon.minOrderValue} required`,
      };
    }

    // Check max usage
    if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
      return { valid: false, error: "Coupon usage limit exceeded" };
    }

    // Check per-user limit
    if (userId && coupon.perUserLimit) {
      const userUsageCount = await this.couponRepository.getUserUsageCount(
        coupon.id,
        BigInt(userId)
      );
      if (userUsageCount >= coupon.perUserLimit) {
        return {
          valid: false,
          error: "You have already used this coupon maximum times",
        };
      }
    }

    // Check scope validity
    const productIds = cartItems.map((item) => BigInt(item.productId));
    const categoryIds = cartItems
      .filter((item) => item.categoryId)
      .map((item) => BigInt(item.categoryId!));

    const scopeValid = await this.couponRepository.isScopeValid(
      coupon.id,
      productIds,
      categoryIds
    );

    if (!scopeValid) {
      return {
        valid: false,
        error: "This coupon is not applicable to items in your cart",
      };
    }

    // Check user eligibility
    if (userId) {
      const userEligible = await this.checkUserEligibility(
        coupon,
        BigInt(userId)
      );
      if (!userEligible) {
        return { valid: false, error: "You are not eligible for this coupon" };
      }
    }

    return { valid: true };
  }

  // Helper: Check User Eligibility
  private async checkUserEligibility(
    coupon: any,
    userId: bigint
  ): Promise<boolean> {
    if (coupon.userEligibility === CouponUserEligibility.ALL) {
      return true;
    }

    if (coupon.userEligibility === CouponUserEligibility.SPECIFIC_USERS) {
      return await this.couponRepository.isUserEligible(coupon.id, userId);
    }

    // Check FIRST_TIME buyers
    if (coupon.userEligibility === CouponUserEligibility.FIRST_TIME) {
      const orderCount = await this.couponRepository.getUserUsageCount(
        coupon.id,
        userId
      );
      return orderCount === 0;
    }

    // Check NEW_USERS
    if (coupon.userEligibility === CouponUserEligibility.NEW_USERS) {
      // This requires user registration date check
      // Implementation depends on your User model
      // For now, return true
      return true;
    }

    return false;
  }

  // Helper: Calculate Discount
  private calculateDiscount(coupon: any, orderAmount: number): number {
    let discount = 0;

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (orderAmount * Number(coupon.discountValue)) / 100;
    } else {
      discount = Number(coupon.discountValue);
    }

    // Apply max discount cap if specified
    if (coupon.maxDiscountAmount) {
      discount = Math.min(discount, Number(coupon.maxDiscountAmount));
    }

    // Ensure discount doesn't exceed order amount
    discount = Math.min(discount, orderAmount);

    return Math.round(discount * 100) / 100; // Round to 2 decimal places
  }

  async incrementUsage(couponId: bigint) {
    await this.couponRepository.incrementUsage(couponId);
  }

  async getActiveCoupons() {
    const now = new Date();
    return this.couponRepository.findActive(now);
  }
}