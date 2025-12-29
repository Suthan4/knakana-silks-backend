import { Order, OrderItem, Prisma } from "@/generated/prisma/client.js";

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
        phone: true;
      };
    };
    items: {
      include: {
        product: {
          include: {
            images: true;
          };
        };
        variant: true;
      };
    };
    shippingAddress: true;
    billingAddress: true;
    payment: true;
    shipment: true;
    coupon: true;
  };
}>;

export interface IOrderRepository {
  findById(id: bigint): Promise<OrderWithRelations | null>;
  findByOrderNumber(orderNumber: string): Promise<OrderWithRelations | null>;
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<OrderWithRelations[]>;
  countByUserId(userId: bigint, where?: any): Promise<number>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<OrderWithRelations[]>;
  count(where?: any): Promise<number>;
  create(data: {
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
  }): Promise<Order>;
  update(id: bigint, data: Partial<Order>): Promise<Order>;
  addItem(data: {
    orderId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    price: number;
  }): Promise<OrderItem>;
}
