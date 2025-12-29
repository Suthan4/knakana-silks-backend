import { inject, injectable } from "tsyringe";
import { Coupon, PrismaClient } from "@/generated/prisma/client.js";
import { ICouponRepository } from "../interface/Icouponrepository.js";

@injectable()
export class CouponRepository implements ICouponRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<Coupon | null> {
    return this.prisma.coupon.findUnique({
      where: { id },
    });
  }

  async findByCode(code: string): Promise<Coupon | null> {
    return this.prisma.coupon.findUnique({
      where: { code },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Coupon[]> {
    return this.prisma.coupon.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
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

  async findActive(currentDate: Date): Promise<Coupon[]> {
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
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
