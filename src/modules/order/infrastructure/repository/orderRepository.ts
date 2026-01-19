import { inject, injectable } from "tsyringe";
import {
  Order,
  OrderItem,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client.js";
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
        shippingInfo: true,
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
        shippingInfo: true,
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
        shippingInfo: true,
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
        shippingInfo: true,
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.order.count({ where });
  }

  /**
   * ✅ UPDATED: Create order with GST amount
   */
  async create(data: {
    userId: bigint;
    orderNumber: string;
    status: any;
    subtotal: number;
    discount: number;
    shippingCost: number;
    gstAmount: number; // ✅ Added GST field
    total: number;
    shippingAddressId: bigint;
    billingAddressId: bigint;
    shippingAddressSnapshot?: any;
    billingAddressSnapshot?: any;
    couponId?: bigint;
  }): Promise<Order> {
    return this.prisma.order.create({
      data: {
        userId: data.userId,
        orderNumber: data.orderNumber,
        status: data.status,
        subtotal: data.subtotal,
        discount: data.discount,
        shippingCost: data.shippingCost,
        gstAmount: data.gstAmount, // ✅ Store GST amount
        total: data.total,
        shippingAddressId: data.shippingAddressId,
        billingAddressId: data.billingAddressId,
        shippingAddressSnapshot: data.shippingAddressSnapshot,
        billingAddressSnapshot: data.billingAddressSnapshot,
        couponId: data.couponId,
      },
    });
  }

  /**
   * Get order items from Buy Now data
   */
  async getOrderItemsFromBuyNow(
    items: { productId: string; variantId?: string; quantity: number }[]
  ) {
    const result: any[] = [];

    for (const i of items) {
      const productId = BigInt(i.productId);
      const variantId = i.variantId ? BigInt(i.variantId) : undefined;

      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          media: true,
        },
      });

      if (!product) {
        throw new Error(`Product not found: ${i.productId}`);
      }

      let variant = null;

      if (variantId) {
        variant = await this.prisma.productVariant.findUnique({
          where: { id: variantId },
        });

        if (!variant) {
          throw new Error(`Variant not found: ${i.variantId}`);
        }
      }

      result.push({
        productId,
        variantId,
        quantity: i.quantity,
        product,
        variant,
      });
    }

    return result;
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