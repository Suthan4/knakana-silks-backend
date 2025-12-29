import { Coupon } from "@/generated/prisma/client.js";

export interface ICouponRepository {
  findById(id: bigint): Promise<Coupon | null>;
  findByCode(code: string): Promise<Coupon | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Coupon[]>;
  count(where?: any): Promise<number>;
  create(data: {
    code: string;
    description?: string;
    discountType: any;
    discountValue: any;
    minOrderValue: any;
    maxUsage?: number;
    perUserLimit?: number;
    validFrom: Date;
    validUntil: Date;
    isActive: boolean;
  }): Promise<Coupon>;
  update(id: bigint, data: Partial<Coupon>): Promise<Coupon>;
  delete(id: bigint): Promise<void>;
  incrementUsage(id: bigint): Promise<void>;
  getUserUsageCount(couponId: bigint, userId: bigint): Promise<number>;
  findActive(currentDate: Date): Promise<Coupon[]>;
}
