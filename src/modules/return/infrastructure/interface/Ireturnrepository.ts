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
        shippingAddress: true;
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
      };
    };
    returnItems: {
      include: {
        product: {
          include: {
            images: true;
          };
        };
        variant: true;
        orderItem: true;
      };
    };
    returnShipment: true;
  };
}>;

export interface IReturnRepository {
  findById(id: bigint): Promise<ReturnWithRelations | null>;
  findByReturnNumber(returnNumber: string): Promise<ReturnWithRelations | null>;
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReturnWithRelations[]>;
  countByUserId(userId: bigint, where?: any): Promise<number>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ReturnWithRelations[]>;
  count(where?: any): Promise<number>;
  create(data: {
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
  }): Promise<Return>;
  update(id: bigint, data: Prisma.ReturnUncheckedUpdateInput): Promise<Return>;
  addReturnItem(data: {
    returnId: bigint;
    orderItemId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    price: number;
  }): Promise<ReturnItem>;
  createReturnShipment(data: {
    shiprocketOrderId: string;
    awb: string;
    courierName: string;
    pickupDate: Date;
    trackingUrl?: string;
    status: string;
  }): Promise<any>;
  updateReturnShipment(id: bigint, data: any): Promise<any>;
}
