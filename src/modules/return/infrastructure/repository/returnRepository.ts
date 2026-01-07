import { inject, injectable } from "tsyringe";
import {
  Return,
  ReturnItem,
  ReturnShipment,
  ReturnMedia, // NEW
  PrismaClient,
  Prisma,
} from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";
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
                    media: {
                      // UPDATED
                      take: 1,
                      where: { isActive: true },
                      orderBy: { order: "asc" },
                    },
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
                media: {
                  // UPDATED
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
        media: true, // NEW: Include return media
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
                    media: {
                      // UPDATED
                      take: 1,
                      where: { isActive: true },
                      orderBy: { order: "asc" },
                    },
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
                media: {
                  // UPDATED
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
        media: true, // NEW
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
                    media: {
                      // UPDATED
                      take: 1,
                      where: { isActive: true },
                      orderBy: { order: "asc" },
                    },
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
                media: {
                  // UPDATED
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
        media: true, // NEW
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
                    media: {
                      // UPDATED
                      take: 1,
                      where: { isActive: true },
                      orderBy: { order: "asc" },
                    },
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
                media: {
                  // UPDATED
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
        media: true, // NEW
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

  // NEW: ReturnMedia methods
  async addReturnMedia(
    returnId: bigint,
    data: {
      type: MediaType;
      url: string;
      key?: string;
      thumbnailUrl?: string;
      mimeType?: string;
      fileSize?: bigint;
      duration?: number;
      width?: number;
      height?: number;
      order?: number;
      description?: string;
    }
  ): Promise<ReturnMedia> {
    return this.prisma.returnMedia.create({
      data: {
        returnId,
        type: data.type,
        url: data.url,
        key: data.key,
        thumbnailUrl: data.thumbnailUrl,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        duration: data.duration,
        width: data.width,
        height: data.height,
        order: data.order ?? 0,
        description: data.description,
      },
    });
  }

  async deleteReturnMedia(id: bigint): Promise<void> {
    await this.prisma.returnMedia.delete({ where: { id } });
  }
}
