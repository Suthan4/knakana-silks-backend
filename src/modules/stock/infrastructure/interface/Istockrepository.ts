import { Stock, StockAdjustment, Prisma } from "@/generated/prisma/client.js";

export type StockWithRelations = Prisma.StockGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        name: true;
        sku: true;
      };
    };
    variant: {
      select: {
        id: true;
        sku: true;
        attributes: true;
      };
    };
    warehouse: {
      select: {
        id: true;
        name: true;
        code: true;
      };
    };
    adjustments: true;
  };
}>;

export interface IStockRepository {
  // Find operations
  findById(id: bigint): Promise<StockWithRelations | null>;
  findByProductAndWarehouse(
    productId: bigint,
    warehouseId: bigint,
    variantId?: bigint
  ): Promise<Stock | null>;
  findByProduct(productId: bigint, variantId?: bigint): Promise<Stock[]>;
  findByWarehouse(warehouseId: bigint): Promise<StockWithRelations[]>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<StockWithRelations[]>;

  // Create/Update operations
  create(data: {
    productId: bigint;
    variantId?: bigint | null;
    warehouseId: bigint;
    quantity: number;
    lowStockThreshold?: number;
  }): Promise<Stock>;

  update(
    id: bigint,
    data: Prisma.StockUpdateInput | Prisma.StockUncheckedUpdateInput
  ): Promise<Stock>;

  updateQuantity(id: bigint, quantity: number): Promise<Stock>;

  // Stock adjustment operations
  createAdjustment(data: {
    stockId: bigint;
    quantity: number;
    reason: string;
    createdBy?: string;
  }): Promise<StockAdjustment>;

  getAdjustmentHistory(stockId: bigint): Promise<StockAdjustment[]>;

  // Delete operations
  delete(id: bigint): Promise<void>;

  // Count operations
  count(where?: any): Promise<number>;

  // Low stock alerts
  findLowStock(): Promise<StockWithRelations[]>;
}