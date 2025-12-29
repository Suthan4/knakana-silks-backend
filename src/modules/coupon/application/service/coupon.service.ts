import { injectable, inject } from "tsyringe";
import { DiscountType } from "@/generated/prisma/enums.js";
import { Decimal } from "@prisma/client/runtime/client";
import { ICouponRepository } from "../../infrastructure/interface/Icouponrepository.js";

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
    minOrderValue?: number;
    maxUsage?: number;
    perUserLimit?: number;
    validFrom: string;
    validUntil: string;
    isActive?: boolean;
  }) {
    // Check if code already exists
    const existing = await this.couponRepository.findByCode(data.code);
    if (existing) {
      throw new Error("Coupon code already exists");
    }

    return this.couponRepository.create({
      code: data.code.toUpperCase(),
      description: data.description,
      discountType: data.discountType,
      discountValue: new Decimal(data.discountValue),
      minOrderValue: new Decimal(data.minOrderValue || 0),
      maxUsage: data.maxUsage,
      perUserLimit: data.perUserLimit,
      validFrom: new Date(data.validFrom),
      validUntil: new Date(data.validUntil),
      isActive: data.isActive ?? true,
    });
  }

  async updateCoupon(
    id: string,
    data: {
      description?: string;
      discountType?: DiscountType;
      discountValue?: number;
      minOrderValue?: number;
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

    const updateData: any = {};
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.discountType !== undefined)
      updateData.discountType = data.discountType;
    if (data.discountValue !== undefined)
      updateData.discountValue = new Decimal(data.discountValue);
    if (data.minOrderValue !== undefined)
      updateData.minOrderValue = new Decimal(data.minOrderValue);
    if (data.maxUsage !== undefined) updateData.maxUsage = data.maxUsage;
    if (data.perUserLimit !== undefined)
      updateData.perUserLimit = data.perUserLimit;
    if (data.validFrom !== undefined)
      updateData.validFrom = new Date(data.validFrom);
    if (data.validUntil !== undefined)
      updateData.validUntil = new Date(data.validUntil);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.couponRepository.update(couponId, updateData);
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
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
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

  async applyCoupon(code: string, orderAmount: number, userId?: string) {
    const coupon = await this.couponRepository.findByCode(code.toUpperCase());

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

    if (orderAmount < Number(coupon.minOrderValue)) {
      throw new Error(
        `Minimum order value of ₹${coupon.minOrderValue} required`
      );
    }

    if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
      throw new Error("Coupon usage limit exceeded");
    }

    // Check per-user limit if userId provided
    if (userId && coupon.perUserLimit) {
      const userUsageCount = await this.couponRepository.getUserUsageCount(
        coupon.id,
        BigInt(userId)
      );
      if (userUsageCount >= coupon.perUserLimit) {
        throw new Error("You have already used this coupon maximum times");
      }
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (orderAmount * Number(coupon.discountValue)) / 100;
    } else {
      discount = Number(coupon.discountValue);
    }

    // Ensure discount doesn't exceed order amount
    discount = Math.min(discount, orderAmount);

    return {
      coupon,
      discount,
      finalAmount: orderAmount - discount,
    };
  }

  async incrementUsage(couponId: bigint) {
    await this.couponRepository.incrementUsage(couponId);
  }

  async getActiveCoupons() {
    const now = new Date();
    return this.couponRepository.findActive(now);
  }
}
