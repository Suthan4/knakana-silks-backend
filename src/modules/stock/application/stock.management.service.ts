// src/modules/stock/application/service/stock.management.service.ts
import { injectable, inject } from "tsyringe";
import { PrismaClient } from "@/generated/prisma/client.js";
import { IStockRepository } from "../infrastructure/interface/Istockrepository.js";

export enum StockAdjustmentReason {
  ORDER_PLACED = "ORDER_PLACED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  ORDER_DELIVERED = "ORDER_DELIVERED",
  RETURN_RECEIVED = "RETURN_RECEIVED",
  RETURN_REJECTED = "RETURN_REJECTED",
  MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
  DAMAGED = "DAMAGED",
  RESTOCKING = "RESTOCKING",
}

interface StockAdjustmentParams {
  productId: bigint;
  variantId?: bigint;
  warehouseId: bigint;
  quantity: number; // positive = increase, negative = decrease
  reason: StockAdjustmentReason;
  referenceId?: string; // orderId, returnId, etc.
  createdBy?: string;
  notes?: string;
}

@injectable()
export class StockManagementService {
  constructor(
    @inject("IStockRepository") private stockRepository: IStockRepository,
    @inject(PrismaClient) private prisma: PrismaClient
  ) {}

  /**
   * ✅ CORE: Adjust stock with transaction safety
   */
  async adjustStock(params: StockAdjustmentParams): Promise<void> {
    const {
      productId,
      variantId,
      warehouseId,
      quantity,
      reason,
      referenceId,
      createdBy,
      notes,
    } = params;

    // ✅ Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      // Find or create stock record
      let stock = await tx.stock.findFirst({
        where: {
          productId,
          variantId: variantId ?? null,
          warehouseId,
        },
      });

      if (!stock) {
        // Create new stock record if doesn't exist
        stock = await tx.stock.create({
          data: {
            productId,
            variantId: variantId ?? null,
            warehouseId,
            quantity: Math.max(0, quantity), // Can't go below 0
            lowStockThreshold: 10,
          },
        });

        console.log(
          `✅ Created stock record: Product ${productId}, Warehouse ${warehouseId}`
        );
      } else {
        // Update existing stock
        const newQuantity = Math.max(0, stock.quantity + quantity);

        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: newQuantity },
        });

        console.log(
          `✅ Stock updated: ${stock.quantity} → ${newQuantity} (${
            quantity > 0 ? "+" : ""
          }${quantity})`
        );
      }

      // ✅ Create adjustment log
      await tx.stockAdjustment.create({
        data: {
          stockId: stock.id,
          quantity,
          reason: `${reason}${referenceId ? ` - Ref: ${referenceId}` : ""}${
            notes ? ` - ${notes}` : ""
          }`,
          createdBy: createdBy || "SYSTEM",
        },
      });
    });
  }

  /**
   * ✅ Reserve stock when order is created (decrease)
   */
  async reserveStockForOrder(orderItems: any[], warehouseId: bigint) {
    for (const item of orderItems) {
      await this.adjustStock({
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        warehouseId,
        quantity: -item.quantity, // Decrease stock
        reason: StockAdjustmentReason.ORDER_PLACED,
        referenceId: `Order`,
        createdBy: "SYSTEM",
      });
    }

    console.log(
      `📦 Reserved stock for order with ${orderItems.length} items`
    );
  }

  /**
   * ✅ Release stock when order is cancelled (increase)
   */
  async releaseStockForCancelledOrder(
    orderItems: any[],
    warehouseId: bigint,
    orderId: string
  ) {
    for (const item of orderItems) {
      await this.adjustStock({
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        warehouseId,
        quantity: item.quantity, // Increase stock back
        reason: StockAdjustmentReason.ORDER_CANCELLED,
        referenceId: orderId,
        createdBy: "SYSTEM",
      });
    }

    console.log(`🔄 Released stock for cancelled order ${orderId}`);
  }

  /**
   * ✅ Restore stock when return is received at warehouse (increase)
   */
  async restoreStockForReturn(
    returnItems: any[],
    warehouseId: bigint,
    returnId: string
  ) {
    for (const item of returnItems) {
      await this.adjustStock({
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        warehouseId,
        quantity: item.quantity, // Increase stock
        reason: StockAdjustmentReason.RETURN_RECEIVED,
        referenceId: returnId,
        createdBy: "SYSTEM",
        notes: "Product returned to warehouse",
      });
    }

    console.log(`📥 Restored stock for return ${returnId}`);
  }

  /**
   * ✅ Check if product has sufficient stock
   */
  async checkStockAvailability(
    productId: bigint,
    variantId: bigint | undefined,
    warehouseId: bigint,
    requiredQuantity: number
  ): Promise<{ available: boolean; currentStock: number }> {
    const stock = await this.stockRepository.findByProductAndWarehouse(
      productId,
      warehouseId,
      variantId
    );

    const currentStock = stock?.quantity || 0;
    const available = currentStock >= requiredQuantity;

    return { available, currentStock };
  }

  /**
   * ✅ Get low stock alerts
   */
  async getLowStockAlerts(): Promise<any[]> {
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
      },
    });
  }

  /**
   * ✅ Get stock history for auditing
   */
  async getStockHistory(
    productId: bigint,
    variantId?: bigint,
    warehouseId?: bigint
  ) {
    const where: any = { productId };

    if (variantId !== undefined) {
      where.variantId = variantId;
    }

    if (warehouseId !== undefined) {
      where.warehouseId = warehouseId;
    }

    const stocks = await this.prisma.stock.findMany({
      where,
      include: {
        adjustments: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        warehouse: true,
      },
    });

    return stocks;
  }
}