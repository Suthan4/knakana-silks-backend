// src/modules/stock/infrastructure/repository/stockRepository.ts
import { inject, injectable } from "tsyringe";
import {
  Stock,
  StockAdjustment,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client.js";
import {
  IStockRepository,
  StockWithRelations,
} from "../interface/Istockrepository.js";

@injectable()
export class StockRepository implements IStockRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  /**
   * Find stock by ID with all relations
   */
  async findById(id: bigint): Promise<StockWithRelations | null> {
    return this.prisma.stock.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        adjustments: {
          orderBy: { createdAt: "desc" },
          take: 50, // Last 50 adjustments
        },
      },
    });
  }

  /**
   * Find stock for specific product in specific warehouse
   * This is the MOST USED method - for checking/updating stock
   */
  async findByProductAndWarehouse(
    productId: bigint,
    warehouseId: bigint,
    variantId?: bigint
  ): Promise<Stock | null> {
    return this.prisma.stock.findFirst({
      where: {
        productId,
        warehouseId,
        variantId: variantId ?? null,
      },
    });
  }

  /**
   * Find all stock records for a product (across all warehouses)
   */
  async findByProduct(
    productId: bigint,
    variantId?: bigint
  ): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: {
        productId,
        variantId: variantId ?? null,
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  /**
   * Find all stock in a warehouse
   */
  async findByWarehouse(warehouseId: bigint): Promise<StockWithRelations[]> {
    return this.prisma.stock.findMany({
      where: { warehouseId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        adjustments: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: {
        quantity: "asc", // Show low stock first
      },
    });
  }

  /**
   * Find all stock with pagination and filters
   */
  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<StockWithRelations[]> {
    return this.prisma.stock.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        adjustments: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
  }

  /**
   * Create new stock record
   */
  async create(data: {
    productId: bigint;
    variantId?: bigint | null;
    warehouseId: bigint;
    quantity: number;
    lowStockThreshold?: number;
  }): Promise<Stock> {
    return this.prisma.stock.create({
      data: {
        productId: data.productId,
        variantId: data.variantId ?? null,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        lowStockThreshold: data.lowStockThreshold ?? 10,
      },
    });
  }

  /**
   * Update stock record
   */
  async update(
    id: bigint,
    data: Prisma.StockUpdateInput | Prisma.StockUncheckedUpdateInput
  ): Promise<Stock> {
    return this.prisma.stock.update({
      where: { id },
      data,
    });
  }

  /**
   * Update stock quantity directly (convenience method)
   */
  async updateQuantity(id: bigint, quantity: number): Promise<Stock> {
    return this.prisma.stock.update({
      where: { id },
      data: {
        quantity: Math.max(0, quantity), // Never go below 0
      },
    });
  }

  /**
   * Create stock adjustment log
   */
  async createAdjustment(data: {
    stockId: bigint;
    quantity: number;
    reason: string;
    createdBy?: string;
  }): Promise<StockAdjustment> {
    return this.prisma.stockAdjustment.create({
      data: {
        stockId: data.stockId,
        quantity: data.quantity,
        reason: data.reason,
        createdBy: data.createdBy || "SYSTEM",
      },
    });
  }

  /**
   * Get adjustment history for a stock record
   */
  async getAdjustmentHistory(stockId: bigint): Promise<StockAdjustment[]> {
    return this.prisma.stockAdjustment.findMany({
      where: { stockId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Delete stock record (rarely used)
   */
  async delete(id: bigint): Promise<void> {
    await this.prisma.stock.delete({
      where: { id },
    });
  }

  /**
   * Count stock records
   */
  async count(where?: any): Promise<number> {
    return this.prisma.stock.count({ where });
  }

  /**
   * Find low stock items (quantity <= lowStockThreshold)
   */
  async findLowStock(): Promise<StockWithRelations[]> {
    return this.prisma.stock.findMany({
      where: {
        quantity: {
          lte: this.prisma.stock.fields.lowStockThreshold,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        adjustments: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: {
        quantity: "asc", // Most critical first
      },
    });
  }
}