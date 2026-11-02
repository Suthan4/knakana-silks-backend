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



/**
 * Single order-stock policy shared by preview validation and final reservation.
 * Backorder-enabled products ignore the threshold but are still limited to
 * one unit while physical stock is positive and below that threshold.
 */
function getOrderStockValidationError(params: {
  productName: string;
  available: number;
  threshold: number;
  allowOutOfStockOrders: boolean;
  requestedQuantity: number;
}): string | null {
  const {
    productName,
    available,
    threshold,
    allowOutOfStockOrders,
    requestedQuantity,
  } = params;

  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    return "Please select a valid quantity.";
  }

  if (available <= 0) {
    return `${productName} is out of stock.`;
  }

  const isBelowThreshold = threshold > 0 && available < threshold;

  // Physical zero is always unavailable, regardless of this setting.
  // Positive stock below threshold is blocked unless limited-stock ordering
  // is explicitly enabled. When enabled, only one unit may be purchased.
  if (isBelowThreshold && !allowOutOfStockOrders) {
    return `${productName} is currently unavailable because stock is below the minimum threshold.`;
  }

  if (isBelowThreshold && allowOutOfStockOrders && requestedQuantity > 1) {
    return `Only 1 item of ${productName} can be ordered.`;
  }

  if (requestedQuantity > available) {
    return `Only ${available} item(s) of ${productName} are available.`;
  }

  return null;
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
   * Resolve legacy cart rows whose variantId is missing.
   * Inference is allowed only when the product has exactly one variant.
   * Multiple variants must be selected explicitly; never guess inventory.
   */
  async resolveOrderItems(orderItems: any[]): Promise<any[]> {
    return Promise.all(
      orderItems.map(async (item) => {
        const existingVariantId = item.variantId ?? item.variant?.id;
        if (existingVariantId != null) {
          return { ...item, variantId: existingVariantId };
        }

        const product =
          item.product ??
          (await this.prisma.product.findUnique({
            where: { id: item.productId },
            select: { id: true, name: true, hasVariants: true },
          }));

        if (!product) {
          throw new Error("Product not found. Please refresh your cart.");
        }

        // Do not trust only the denormalized hasVariants flag here. Legacy
        // cart rows can have a null variantId while the product's inventory
        // is recorded against a real ProductVariant (for example variant 138).
        // Inspect the actual variant rows before querying inventory.
        const variants = await this.prisma.productVariant.findMany({
          where: { productId: item.productId },
          select: {
            id: true,
            price: true,
            sellingPrice: true,
            weight: true,
            length: true,
            breadth: true,
            height: true,
            sku: true,
            size: true,
            color: true,
            fabric: true,
            attributes: true,
          },
          orderBy: { id: "asc" },
        });

        if (variants.length === 0) {
          // A product with no variant rows is a simple product. Query its
          // simple-product stock record (variantId IS NULL).
          return { ...item, variantId: undefined, variant: null };
        }

        if (variants.length > 1) {
          throw new Error(
            `${product.name ?? "This product"} needs a variant selection. Please remove it from your cart and select the variant again.`,
          );
        }

        return {
          ...item,
          variantId: variants[0].id,
          variant: variants[0],
        };
      }),
    );
  }

  async validateStockForOrder(orderItems: any[], warehouseId: bigint): Promise<void> {
    const grouped = new Map<string, { productId: bigint; variantId?: bigint; quantity: number }>();
    for (const item of orderItems) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new Error("Please select a valid quantity.");
      }
      const variantId = item.variantId ?? item.variant?.id ?? undefined;
      const key = `${item.productId.toString()}:${variantId?.toString() ?? "simple"}`;
      const current = grouped.get(key);
      if (current) current.quantity += item.quantity;
      else grouped.set(key, {
        productId: item.productId,
        variantId,
        quantity: item.quantity,
      });
    }

    for (const item of grouped.values()) {
      const [product, stock] = await Promise.all([
        this.prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true, isActive: true, allowOutOfStockOrders: true },
        }),
        this.stockRepository.findByProductAndWarehouse(
          item.productId,
          warehouseId,
          item.variantId,
        ),
      ]);

      if (!product || !product.isActive) {
        throw new Error(`${product?.name ?? "This product"} is no longer available.`);
      }
      const available = Math.max(0, Number(stock?.quantity ?? 0));
      const threshold = Math.max(0, Number(stock?.lowStockThreshold ?? 0));
      const allowOutOfStockOrders = product.allowOutOfStockOrders === true;
      const validationError = getOrderStockValidationError({
        productName: product.name,
        available,
        threshold,
        allowOutOfStockOrders,
        requestedQuantity: item.quantity,
      });

      if (validationError) {
        console.warn("[ORDER_STOCK_VALIDATION]", {
          phase: "preview-or-prepayment-validation",
          productId: item.productId.toString(),
          variantId: item.variantId?.toString() ?? null,
          warehouseId: warehouseId.toString(),
          stockRecordFound: Boolean(stock),
          available,
          threshold,
          allowOutOfStockOrders,
          requestedQuantity: item.quantity,
          reason: validationError,
        });
        throw new Error(validationError);
      }
    }
  }

  /**
   * ✅ Reserve stock when order is created (decrease)
   */
  async reserveStockForOrder(orderItems: any[], warehouseId: bigint) {
    // Validate and reserve every line in one transaction. This prevents partial
    // reservations and concurrent orders from consuming the same remaining units.
    await this.prisma.$transaction(async (tx) => {
      const grouped = new Map<string, { productId: bigint; variantId?: bigint; quantity: number; name: string }>();

      for (const item of orderItems) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          throw new Error("Please select a valid quantity.");
        }
        const variantId = item.variantId ?? item.variant?.id ?? undefined;
        const key = `${item.productId.toString()}:${variantId?.toString() ?? "simple"}`;
        const current = grouped.get(key);
        if (current) current.quantity += item.quantity;
        else grouped.set(key, {
          productId: item.productId,
          variantId,
          quantity: item.quantity,
          name: item.product?.name ?? "This product",
        });
      }

      for (const item of grouped.values()) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { name: true, isActive: true, allowOutOfStockOrders: true },
        });
        if (!product || !product.isActive) {
          throw new Error(`${product?.name ?? item.name} is no longer available.`);
        }

        const stock = await tx.stock.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId ?? null,
            warehouseId,
          },
        });

        const available = Math.max(0, Number(stock?.quantity ?? 0));
        // Recheck the exact same policy atomically at final reservation.
        const threshold = Math.max(0, Number(stock?.lowStockThreshold ?? 0));
        const allowOutOfStockOrders = product.allowOutOfStockOrders === true;
        const validationError = getOrderStockValidationError({
          productName: product.name,
          available,
          threshold,
          allowOutOfStockOrders,
          requestedQuantity: item.quantity,
        });

        if (validationError) {
          console.warn("[ORDER_STOCK_VALIDATION]", {
            phase: "final-stock-reservation",
            productId: item.productId.toString(),
            variantId: item.variantId?.toString() ?? null,
            warehouseId: warehouseId.toString(),
            stockRecordFound: Boolean(stock),
            available,
            threshold,
            allowOutOfStockOrders,
            requestedQuantity: item.quantity,
            reason: validationError,
          });
          throw new Error(validationError);
        }

        if (!stock) {
          throw new Error(`${product.name} is out of stock.`);
        }

        // Conditional decrement prevents two concurrent checkouts from both
        // consuming the same stock snapshot under READ COMMITTED isolation.
        const decrement = await tx.stock.updateMany({
          where: {
            id: stock.id,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity } },
        });
        if (decrement.count !== 1) {
          throw new Error(`${product.name} stock has just changed. Please refresh your cart and try again.`);
        }

        await tx.stockAdjustment.create({
          data: {
            stockId: stock.id,
            quantity: -item.quantity,
            reason: `${StockAdjustmentReason.ORDER_PLACED} - Ref: Order`,
            createdBy: "SYSTEM",
          },
        });
      }
    });

    console.log(`📦 Reserved stock for order with ${orderItems.length} items`);
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