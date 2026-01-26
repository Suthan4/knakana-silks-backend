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
            media: true;
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
    shippingInfo: true;
  };
}>;

export type BuyNowItemDTO = {
  productId: string;
  variantId?: string;
  quantity: number;
};

export type BuyNowOrderItem = {
  productId: bigint;
  variantId?: bigint;
  quantity: number;
  product: any;
  variant: any | null;
};

export interface IOrderRepository {
  // Find operations
  findById(id: bigint): Promise<OrderWithRelations | null>;
  findByOrderNumber(orderNumber: string): Promise<OrderWithRelations | null>;
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<OrderWithRelations[]>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<OrderWithRelations[]>;

  // Count operations
  countByUserId(userId: bigint, where?: any): Promise<number>;
  count(where?: any): Promise<number>;

  // Create/Update operations
  create(data: {
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
  }): Promise<Order>;

  update(
    id: bigint,
    data: Prisma.OrderUpdateInput | Prisma.OrderUncheckedUpdateInput
  ): Promise<Order>;

  addItem(data: {
    orderId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    price: number;
  }): Promise<OrderItem>;

  getOrderItemsFromBuyNow(items: BuyNowItemDTO[]): Promise<BuyNowOrderItem[]>;
  findManyForAutoAwb(params?: { take?: number }): Promise<OrderWithRelations[]>;
}