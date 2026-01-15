import { inject, injectable } from "tsyringe";
import { Coupon, PrismaClient } from "@/generated/prisma/client.js";
import {
  CouponWithRelations,
  ICouponRepository,
} from "../interface/Icouponrepository.js";

@injectable()
export class CouponRepository implements ICouponRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<CouponWithRelations | null> {
    return this.prisma.coupon.findUnique({
      where: { id },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            slug: true,
            sellingPrice: true,
            media: {
              where: { isActive: true, type: "IMAGE" },
              take: 1,
              select: { url: true },
            },
          },
        },
        eligibleUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async findByCode(code: string): Promise<CouponWithRelations | null> {
    return this.prisma.coupon.findUnique({
      where: { code },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            slug: true,
            sellingPrice: true,
            media: {
              where: { isActive: true, type: "IMAGE" },
              take: 1,
              select: { url: true },
            },
          },
        },
        eligibleUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<CouponWithRelations[]> {
    return this.prisma.coupon.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            slug: true,
            sellingPrice: true,
            media: {
              where: { isActive: true, type: "IMAGE" },
              take: 1,
              select: { url: true },
            },
          },
        },
        eligibleUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.coupon.count({ where });
  }

  async create(data: {
    code: string;
    description?: string;
    discountType: any;
    discountValue: any;
    minOrderValue: any;
    maxDiscountAmount?: any;
    scope: any;
    userEligibility: any;
    newUserDays?: number;
    maxUsage?: number;
    perUserLimit?: number;
    validFrom: Date;
    validUntil: Date;
    isActive: boolean;
  }): Promise<Coupon> {
    return this.prisma.coupon.create({
      data,
    });
  }

  async update(id: bigint, data: Partial<Coupon>): Promise<Coupon> {
    return this.prisma.coupon.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.coupon.delete({ where: { id } });
  }

  async incrementUsage(id: bigint): Promise<void> {
    await this.prisma.coupon.update({
      where: { id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });
  }

  async getUserUsageCount(couponId: bigint, userId: bigint): Promise<number> {
    return this.prisma.order.count({
      where: {
        couponId,
        userId,
      },
    });
  }

  // 🆕 NEW: Category Management
  async addCategories(couponId: bigint, categoryIds: bigint[]): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        categories: {
          connect: categoryIds.map((id) => ({ id })),
        },
      },
    });
  }

  async removeAllCategories(couponId: bigint): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        categories: {
          set: [],
        },
      },
    });
  }

  // 🆕 NEW: Product Management
  async addProducts(couponId: bigint, productIds: bigint[]): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        products: {
          connect: productIds.map((id) => ({ id })),
        },
      },
    });
  }

  async removeAllProducts(couponId: bigint): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        products: {
          set: [],
        },
      },
    });
  }

  // 🆕 NEW: Eligible Users Management
  async addEligibleUsers(couponId: bigint, userIds: bigint[]): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        eligibleUsers: {
          connect: userIds.map((id) => ({ id })),
        },
      },
    });
  }

  async removeAllEligibleUsers(couponId: bigint): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        eligibleUsers: {
          set: [],
        },
      },
    });
  }

  // 🆕 NEW: Find Active Coupons
  async findActive(currentDate: Date): Promise<CouponWithRelations[]> {
    return this.prisma.coupon.findMany({
      where: {
        isActive: true,
        validFrom: {
          lte: currentDate,
        },
        validUntil: {
          gte: currentDate,
        },
      },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            slug: true,
            sellingPrice: true,
            media: {
              where: { isActive: true, type: "IMAGE" },
              take: 1,
              select: { url: true },
            },
          },
        },
        eligibleUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // 🆕 NEW: Find Applicable Coupons for User
  async findApplicableForUser(
    userId: bigint,
    productIds: bigint[],
    categoryIds: bigint[],
    currentDate: Date
  ): Promise<CouponWithRelations[]> {
    return this.prisma.coupon.findMany({
      where: {
        isActive: true,
        validFrom: { lte: currentDate },
        validUntil: { gte: currentDate },
        OR: [
          // ALL scope - applies to everything
          { scope: "ALL" },
          // CATEGORY scope - at least one cart category matches
          {
            scope: "CATEGORY",
            categories: {
              some: {
                id: { in: categoryIds },
              },
            },
          },
          // PRODUCT scope - at least one cart product matches
          {
            scope: "PRODUCT",
            products: {
              some: {
                id: { in: productIds },
              },
            },
          },
        ],
        AND: [
          // User eligibility check
          {
            OR: [
              { userEligibility: "ALL" },
              {
                userEligibility: "SPECIFIC_USERS",
                eligibleUsers: {
                  some: { id: userId },
                },
              },
              // FIRST_TIME and NEW_USERS are checked in service layer
            ],
          },
        ],
      },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            slug: true,
            sellingPrice: true,
            media: {
              where: { isActive: true, type: "IMAGE" },
              take: 1,
              select: { url: true },
            },
          },
        },
        eligibleUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        discountValue: "desc",
      },
    });
  }

  // 🆕 NEW: Check if User is Eligible
  async isUserEligible(couponId: bigint, userId: bigint): Promise<boolean> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      include: {
        eligibleUsers: {
          where: { id: userId },
        },
      },
    });

    if (!coupon) return false;

    // If ALL, everyone is eligible
    if (coupon.userEligibility === "ALL") return true;

    // If SPECIFIC_USERS, check if user is in the list
    if (coupon.userEligibility === "SPECIFIC_USERS") {
      return coupon.eligibleUsers.length > 0;
    }

    // FIRST_TIME and NEW_USERS are checked in service layer
    return false;
  }

  // 🆕 NEW: Check if Scope is Valid for Cart
  async isScopeValid(
    couponId: bigint,
    productIds: bigint[],
    categoryIds: bigint[]
  ): Promise<boolean> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      include: {
        categories: true,
        products: true,
      },
    });

    if (!coupon) return false;

    // ALL scope - always valid
    if (coupon.scope === "ALL") return true;

    // CATEGORY scope - at least one cart category must match
    if (coupon.scope === "CATEGORY") {
      const couponCategoryIds = coupon.categories.map((c) => c.id);
      return categoryIds.some((id) => couponCategoryIds.includes(id));
    }

    // PRODUCT scope - at least one cart product must match
    if (coupon.scope === "PRODUCT") {
      const couponProductIds = coupon.products.map((p) => p.id);
      return productIds.some((id) => couponProductIds.includes(id));
    }

    return false;
  }
}