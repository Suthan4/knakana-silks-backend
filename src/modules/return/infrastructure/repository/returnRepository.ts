import { inject, injectable } from "tsyringe";
import {
  Return,
  ReturnItem,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client.js";
import {
  ReturnWithRelations,
  IReturnRepository,
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
            items: {
              include: {
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
              },
            },
            shippingAddress: true,
            billingAddress: true,
            shippingInfo: true,
            payment: true,
            shipment: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        returnItems: {
          include: {
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
            orderItem: true,
          },
        },
        returnShipment: true,
        media: true,
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
            items: {
              include: {
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
              },
            },
            shippingAddress: true,
            billingAddress: true,
            shippingInfo: true,
            payment: true,
            shipment: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        returnItems: {
          include: {
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
            orderItem: true,
          },
        },
        returnShipment: true,
        media: true,
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
            items: {
              include: {
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
              },
            },
            shippingAddress: true,
            billingAddress: true,
            shippingInfo: true,
            payment: true,
            shipment: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        returnItems: {
          include: {
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
            orderItem: true,
          },
        },
        returnShipment: true,
        media: true,
      },
    });
  }

  async findByOrderId(orderId: bigint): Promise<ReturnWithRelations[]> {
    return this.prisma.return.findMany({
      where: { orderId },
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
            items: {
              include: {
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
              },
            },
            shippingAddress: true,
            billingAddress: true,
            shippingInfo: true,
            payment: true,
            shipment: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        returnItems: {
          include: {
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
            orderItem: true,
          },
        },
        returnShipment: true,
        media: true,
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
            items: {
              include: {
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
              },
            },
            shippingAddress: true,
            billingAddress: true,
            shippingInfo: true,
            payment: true,
            shipment: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        returnItems: {
          include: {
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
            orderItem: true,
          },
        },
        returnShipment: true,
        media: true,
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.return.count({ where });
  }

  async create(data: {
    userId: bigint;
    orderId: bigint;
    returnNumber: string;
    reason: any;
    reasonDetails: string;
    images?: string[];
    refundAmount: number;
    refundMethod: any;
    bankDetails?: any;
  }): Promise<Return> {
    return this.prisma.return.create({
      data: {
        userId: data.userId,
        orderId: data.orderId,
        returnNumber: data.returnNumber,
        reason: data.reason,
        reasonDetails: data.reasonDetails,
        images: data.images || [],
        refundAmount: data.refundAmount,
        refundMethod: data.refundMethod,
        bankDetails: data.bankDetails,
      },
    });
  }

  async update(
    id: bigint,
    data: Prisma.ReturnUpdateInput | Prisma.ReturnUncheckedUpdateInput
  ): Promise<Return> {
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
  }): Promise<any> {
    return this.prisma.returnShipment.create({
      data,
    });
  }

  async updateReturnShipment(id: bigint, data: any): Promise<any> {
    return this.prisma.returnShipment.update({
      where: { id },
      data,
    });
  }

  async hasReturnForOrderItem(orderItemId: bigint): Promise<boolean> {
    const count = await this.prisma.returnItem.count({
      where: { orderItemId },
    });
    return count > 0;
  }
}