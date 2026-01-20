import { inject, injectable } from "tsyringe";
import { ProductRequest, PrismaClient } from "@/generated/prisma/client.js";
import {
  IProductRequestRepository,
  ProductRequestWithRelations,
} from "../interface/Iproductrequest.repository.js";

@injectable()
export class ProductRequestRepository implements IProductRequestRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async create(data: {
    userId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    customerNote?: string;
    requestNumber: string;
  }): Promise<ProductRequest> {
    return this.prisma.productRequest.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        variantId: data.variantId ?? null,
        quantity: data.quantity,
        customerNote: data.customerNote,
        requestNumber: data.requestNumber,
      },
    });
  }

  async findById(id: bigint): Promise<ProductRequestWithRelations | null> {
    return this.prisma.productRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
        order: true,
      },
    });
  }

  async findByRequestNumber(
    requestNumber: string
  ): Promise<ProductRequestWithRelations | null> {
    return this.prisma.productRequest.findUnique({
      where: { requestNumber },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
        order: true,
      },
    });
  }

  async findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ProductRequestWithRelations[]> {
    return this.prisma.productRequest.findMany({
      where: { userId, ...params.where },
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
        order: true,
      },
    });
  }

  async countByUserId(userId: bigint, where?: any): Promise<number> {
    return this.prisma.productRequest.count({
      where: { userId, ...where },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ProductRequestWithRelations[]> {
    return this.prisma.productRequest.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
        order: true,
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.productRequest.count({ where });
  }

  async update(id: bigint, data: Partial<ProductRequest>): Promise<ProductRequest> {
    return this.prisma.productRequest.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.productRequest.delete({ where: { id } });
  }
}