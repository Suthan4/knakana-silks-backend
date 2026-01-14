import { inject, injectable } from "tsyringe";
import { Order, OrderItem, Prisma, PrismaClient } from "@/generated/prisma/client.js";
import {
  OrderWithRelations,
  IOrderRepository,
} from "../interface/Iorderrepository.js";

@injectable()
export class OrderRepository implements IOrderRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<OrderWithRelations | null> {
    return this.prisma.order.findUnique({
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
        payment: true,
        shipment: true,
        coupon: true,
      },
    });
  }

  async findByOrderNumber(
    orderNumber: string
  ): Promise<OrderWithRelations | null> {
    return this.prisma.order.findUnique({
      where: { orderNumber },
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
        payment: true,
        shipment: true,
        coupon: true,
      },
    });
  }

  async findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<OrderWithRelations[]> {
    return this.prisma.order.findMany({
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
        payment: true,
        shipment: true,
        coupon: true,
      },
    });
  }

  async countByUserId(userId: bigint, where?: any): Promise<number> {
    return this.prisma.order.count({
      where: { userId, ...where },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<OrderWithRelations[]> {
    return this.prisma.order.findMany({
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
        payment: true,
        shipment: true,
        coupon: true,
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.order.count({ where });
  }

  async create(data: {
    userId: bigint;
    orderNumber: string;
    status: any;
    subtotal: number;
    discount: number;
    shippingCost: number;
    total: number;
    shippingAddressId: bigint;
    billingAddressId: bigint;
    couponId?: bigint;
  }): Promise<Order> {
    return this.prisma.order.create({
      data,
    });
  }

  async update(
    id: bigint,
    data: Prisma.OrderUpdateInput | Prisma.OrderUncheckedUpdateInput
  ): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data,
    });
  }

  async addItem(data: {
    orderId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    price: number;
  }): Promise<OrderItem> {
    return this.prisma.orderItem.create({
      data: {
        orderId: data.orderId,
        productId: data.productId,
        variantId: data.variantId ?? null,
        quantity: data.quantity,
        price: data.price,
      },
    });
  }
}
