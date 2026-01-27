import { Return, ReturnItem, Prisma } from "@/generated/prisma/client.js";

export type ReturnWithRelations = Prisma.ReturnGetPayload<{
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
    order: {
      include: {
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
        shippingInfo: true;
        payment: true;
        shipment: true;
        user: {
          select: {
            id: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
      };
    };
    returnItems: {
      include: {
        product: {
          include: {
            media: true;
          };
        };
        variant: true;
        orderItem: true;
      };
    };
    returnShipment: true;
    media: true;
  };
}>;

export interface IReturnRepository {
  // Find operations
  findById(id: bigint): Promise<ReturnWithRelations | null>;
  findByReturnNumber(returnNumber: string): Promise<ReturnWithRelations | null>;
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReturnWithRelations[]>;
  findByOrderId(orderId: bigint): Promise<ReturnWithRelations[]>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ReturnWithRelations[]>;

  // Count operations
  countByUserId(userId: bigint, where?: any): Promise<number>;
  count(where?: any): Promise<number>;

  // Create/Update operations
  create(data: {
    userId: bigint;
    orderId: bigint;
    returnNumber: string;
    reason: any;
    reasonDetails: string;
    images?: string[];
    status?: any;
    refundAmount: number;
    refundMethod: any;
    bankDetails?: any;
  }): Promise<Return>;

  update(
    id: bigint,
    data: Prisma.ReturnUpdateInput | Prisma.ReturnUncheckedUpdateInput
  ): Promise<Return>;

  addReturnItem(data: {
    returnId: bigint;
    orderItemId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    price: number;
  }): Promise<ReturnItem>;

  // Return shipment operations
  createReturnShipment(data: {
    shiprocketOrderId: string;
    awb: string;
    courierName: string;
    pickupDate: Date;
    trackingUrl?: string;
    status: string;
  }): Promise<any>;

  updateReturnShipment(id: bigint, data: any): Promise<any>;

  // Check if order item already has return
  hasReturnForOrderItem(orderItemId: bigint): Promise<boolean>;
}