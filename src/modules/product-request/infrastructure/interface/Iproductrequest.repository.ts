import { ProductRequest, Prisma } from "@/generated/prisma/client.js";

export type ProductRequestWithRelations = Prisma.ProductRequestGetPayload<{
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
    product: {
      include: {
        media: true;
      };
    };
    variant: true;
    order: true;
  };
}>;

export interface IProductRequestRepository {
  create(data: {
    userId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
    customerNote?: string;
    requestNumber: string;
  }): Promise<ProductRequest>;

  findById(id: bigint): Promise<ProductRequestWithRelations | null>;
  findByRequestNumber(requestNumber: string): Promise<ProductRequestWithRelations | null>;
  
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ProductRequestWithRelations[]>;

  countByUserId(userId: bigint, where?: any): Promise<number>;

  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ProductRequestWithRelations[]>;

  count(where?: any): Promise<number>;

  update(id: bigint, data: Partial<ProductRequest>): Promise<ProductRequest>;
  
  delete(id: bigint): Promise<void>;
}