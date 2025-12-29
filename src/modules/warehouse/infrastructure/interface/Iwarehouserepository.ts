import { Warehouse, Stock, Prisma } from "@/generated/prisma/client.js";

export type WarehouseWithStock = Prisma.WarehouseGetPayload<{
  include: {
    stock: {
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
}>;

export interface IWarehouseRepository {
  findById(id: bigint): Promise<Warehouse | null>;
  findByCode(code: string): Promise<Warehouse | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Warehouse[]>;
  count(where?: any): Promise<number>;
  create(data: {
    name: string;
    code: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    isActive: boolean;
  }): Promise<Warehouse>;
  update(id: bigint, data: Partial<Warehouse>): Promise<Warehouse>;
  delete(id: bigint): Promise<void>;
  findActive(): Promise<Warehouse[]>;
  hasStock(warehouseId: bigint): Promise<boolean>;
  getStock(warehouseId: bigint): Promise<Stock[]>;
}
