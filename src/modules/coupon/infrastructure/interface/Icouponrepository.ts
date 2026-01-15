import { Coupon, Prisma } from "@/generated/prisma/client.js";

export type CouponWithRelations = Prisma.CouponGetPayload<{
  include: {
    categories: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
    products: {
      select: {
        id: true;
        name: true;
        slug: true;
        sellingPrice: true;
        media: {
          where: { isActive: true; type: "IMAGE" };
          take: 1;
          select: { url: true };
        };
      };
    };
    eligibleUsers: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
      };
    };
  };
}>;

export interface ICouponRepository {
  // Basic CRUD
  findById(id: bigint): Promise<CouponWithRelations | null>;
  findByCode(code: string): Promise<CouponWithRelations | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<CouponWithRelations[]>;
  count(where?: any): Promise<number>;
  
  create(data: {
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
  }): Promise<Coupon>;
  
  update(id: bigint, data: Partial<Coupon>): Promise<Coupon>;
  delete(id: bigint): Promise<void>;
  
  // Usage Management
  incrementUsage(id: bigint): Promise<void>;
  getUserUsageCount(couponId: bigint, userId: bigint): Promise<number>;
  
  // 🆕 NEW: Scope Management
  addCategories(couponId: bigint, categoryIds: bigint[]): Promise<void>;
  removeAllCategories(couponId: bigint): Promise<void>;
  addProducts(couponId: bigint, productIds: bigint[]): Promise<void>;
  removeAllProducts(couponId: bigint): Promise<void>;
  
  // 🆕 NEW: User Eligibility Management
  addEligibleUsers(couponId: bigint, userIds: bigint[]): Promise<void>;
  removeAllEligibleUsers(couponId: bigint): Promise<void>;
  
  // 🆕 NEW: Validation Queries
  findActive(currentDate: Date): Promise<CouponWithRelations[]>;
  findApplicableForUser(
    userId: bigint,
    productIds: bigint[],
    categoryIds: bigint[],
    currentDate: Date
  ): Promise<CouponWithRelations[]>;
  isUserEligible(couponId: bigint, userId: bigint): Promise<boolean>;
  isScopeValid(
    couponId: bigint,
    productIds: bigint[],
    categoryIds: bigint[]
  ): Promise<boolean>;
}