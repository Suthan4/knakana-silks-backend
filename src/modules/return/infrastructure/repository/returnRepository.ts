import { inject, injectable } from "tsyringe";
import {
  Return,
  ReturnItem,
  ReturnShipment,
  PrismaClient,
  Prisma,
} from "@/generated/prisma/client.js";
import {
  IReturnRepository,
  ReturnWithRelations,
} from "../interface/Ireturnrepository.js";

@injectable()
export class ReturnRepository implements IReturnRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<ReturnWithRelations | null> {
    return this.prisma.return.findUnique({
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
        order: {
          include: {
            shippingAddress: true,
            items: {
              include: {
                product: {
                  include: {
                    images: { take: 1, orderBy: { order: "asc" } },
                  },
                },
                variant: true,
              },
            },
          },
        },
        returnItems: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { order: "asc" } },
              },
            },
            variant: true,
            orderItem: true,
          },
        },
        returnShipment: true,
      },
    });
  }

  async findByReturnNumber(
    returnNumber: string
  ): Promise<ReturnWithRelations | null> {
    return this.prisma.return.findUnique({
      where: { returnNumber },
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
        order: {
          include: {
            shippingAddress: true,
            items: {
              include: {
                product: {
                  include: {
                    images: { take: 1, orderBy: { order: "asc" } },
                  },
                },
                variant: true,
              },
            },
          },
        },
        returnItems: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { order: "asc" } },
              },
            },
            variant: true,
            orderItem: true,
          },
        },
        returnShipment: true,
      },
    });
  }

  async findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReturnWithRelations[]> {
    return this.prisma.return.findMany({
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
        order: {
          include: {
            shippingAddress: true,
            items: {
              include: {
                product: {
                  include: {
                    images: { take: 1, orderBy: { order: "asc" } },
                  },
                },
                variant: true,
              },
            },
          },
        },
        returnItems: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { order: "asc" } },
              },
            },
            variant: true,
            orderItem: true,
          },
        },
        returnShipment: true,
      },
    });
  }

  async countByUserId(userId: bigint, where?: any): Promise<number> {
    return this.prisma.return.count({
      where: { userId, ...where },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ReturnWithRelations[]> {
    return this.prisma.return.findMany({
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
        order: {
          include: {
            shippingAddress: true,
            items: {
              include: {
                product: {
                  include: {
                    images: { take: 1, orderBy: { order: "asc" } },
                  },
                },
                variant: true,
              },
            },
          },
        },
        returnItems: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { order: "asc" } },
              },
            },
            variant: true,
            orderItem: true,
          },
        },
        returnShipment: true,
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.return.count({ where });
  }

  async create(data: {
    returnNumber: string;
    userId: bigint;
    orderId: bigint;
    reason: any;
    reasonDetails: string;
    images: string[];
    status: any;
    refundAmount: number;
    refundMethod: any;
    bankDetails?: any;
  }): Promise<Return> {
    return this.prisma.return.create({
      data,
    });
  }

  async update(id: bigint, data: Prisma.ReturnUpdateInput): Promise<Return> {
    return this.prisma.return.update({
      where: { id },
      data,
    });
  }

  async addReturnItem(data: {
    returnId: bigint;
    orderItemId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    price: number;
  }): Promise<ReturnItem> {
    return this.prisma.returnItem.create({
      data: {
        returnId: data.returnId,
        orderItemId: data.orderItemId,
        productId: data.productId,
        variantId: data.variantId ?? null,
        quantity: data.quantity,
        price: data.price,
      },
    });
  }

  async createReturnShipment(data: {
    shiprocketOrderId: string;
    awb: string;
    courierName: string;
    pickupDate: Date;
    trackingUrl?: string;
    status: string;
  }): Promise<ReturnShipment> {
    return this.prisma.returnShipment.create({
      data,
    });
  }

  async updateReturnShipment(id: bigint, data: any): Promise<ReturnShipment> {
    return this.prisma.returnShipment.update({
      where: { id },
      data,
    });
  }
}
