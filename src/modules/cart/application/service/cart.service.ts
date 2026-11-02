import { injectable, inject } from "tsyringe";
import { ICartRepository } from "../../infrastructure/interface/Icartrepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";
import { PrismaClient } from "@/generated/prisma/client.js";

class CartValidationError extends Error {
  statusCode = 409;
  code = "CART_STOCK_VALIDATION";
}

type StockRow = { quantity: number; lowStockThreshold: number };

function getStockState(stockRows: StockRow[] | undefined) {
  const rows = stockRows ?? [];
  const available = rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
  const threshold = rows.reduce((sum, row) => sum + Math.max(0, Number(row.lowStockThreshold) || 0), 0);
  return { available, threshold, isBelowThreshold: available > 0 && threshold > 0 && available < threshold };
}

function validateStock(
  product: { allowOutOfStockOrders?: boolean; name?: string },
  stockRows: StockRow[] | undefined,
  requestedQuantity: number,
  currentQuantity = 0,
) {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    throw new CartValidationError("Please select a valid quantity.");
  }

  const { available, threshold, isBelowThreshold } = getStockState(stockRows);
  const totalRequested = currentQuantity + requestedQuantity;
  const productName = product.name || "This product";

  if (available <= 0) {
    throw new CartValidationError(`${productName} is out of stock.`);
  }

  // A zero quantity is always unavailable (checked above).
  // Below threshold: block when limited-stock ordering is disabled;
  // when enabled, allow at most one unit while physical stock is positive.
  if (isBelowThreshold && !product.allowOutOfStockOrders) {
    throw new CartValidationError(
      `${productName} is currently unavailable because stock is below the minimum threshold.`,
    );
  }

  if (isBelowThreshold && product.allowOutOfStockOrders && totalRequested > 1) {
    throw new CartValidationError(`Only 1 item of ${productName} can be ordered.`);
  }

  if (totalRequested > available) {
    throw new CartValidationError(
      `Only ${available} item(s) of ${productName} are available.`,
    );
  }
}

@injectable()
export class CartService {
  constructor(
    @inject("ICartRepository") private cartRepository: ICartRepository,
    @inject("IProductRepository") private productRepository: IProductRepository,
    @inject(PrismaClient) private prisma: PrismaClient
  ) {}

  /**
   * Cart mutations and order preview/reservation must use the same warehouse.
   * Orders ship from the active default-pickup warehouse, falling back to the
   * first active warehouse when no default is configured.
   */
  private async getPickupWarehouseId(): Promise<bigint | null> {
    const defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { isDefaultPickup: true, isActive: true },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (defaultWarehouse) return defaultWarehouse.id;

    const fallbackWarehouse = await this.prisma.warehouse.findFirst({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    return fallbackWarehouse?.id ?? null;
  }

  private filterPickupWarehouseStock<T extends { warehouseId: bigint }>(
    rows: T[] | undefined,
    warehouseId: bigint | null,
  ): T[] {
    if (!rows) return [];
    if (!warehouseId) return rows;
    return rows.filter((row) => row.warehouseId === warehouseId);
  }

  async getOrCreateCart(userId: string) {
    const userIdBigInt = BigInt(userId);
    let cart = await this.cartRepository.findByUserId(userIdBigInt);

    if (!cart) {
      cart = await this.cartRepository.create(userIdBigInt);
    }

    return cart;
  }

  async getCart(userId: string) {
    const cart = await this.cartRepository.getCartWithItems(BigInt(userId));

    if (!cart) {
      return { items: [], totalItems: 0, subtotal: 0 };
    }

    const pickupWarehouseId = await this.getPickupWarehouseId();

    // Repair legacy cart rows that have a missing variantId only when the
    // product has exactly one variant. Never guess between multiple variants.
    const unresolvedProductIds = Array.from(
      new Set(
        cart.items
          .filter((item) => !item.variantId && item.product.hasVariants)
          .map((item) => item.productId),
      ),
    );

    const legacyVariants = unresolvedProductIds.length
      ? await this.prisma.productVariant.findMany({
          where: { productId: { in: unresolvedProductIds } },
          include: { stock: true },
        })
      : [];

    const variantsByProduct = new Map<string, typeof legacyVariants>();
    for (const variant of legacyVariants) {
      const key = variant.productId.toString();
      const rows = variantsByProduct.get(key) ?? [];
      rows.push(variant);
      variantsByProduct.set(key, rows);
    }

    const pickupItems = cart.items.map((item) => {
      const candidates = variantsByProduct.get(item.productId.toString()) ?? [];
      const inferredVariant =
        !item.variantId && item.product.hasVariants && candidates.length === 1
          ? candidates[0]
          : null;
      const resolvedVariant = item.variant ?? inferredVariant;
      const resolvedVariantId = item.variantId ?? inferredVariant?.id ?? null;

      const productStock = this.filterPickupWarehouseStock(
        item.product.stock,
        pickupWarehouseId,
      ).filter((row) =>
        resolvedVariantId
          ? row.variantId === resolvedVariantId
          : row.variantId == null,
      );

      return {
        ...item,
        variantId: resolvedVariantId,
        product: {
          ...item.product,
          stock: productStock,
        },
        variant: resolvedVariant
          ? {
              ...resolvedVariant,
              stock: this.filterPickupWarehouseStock(
                resolvedVariant.stock,
                pickupWarehouseId,
              ),
            }
          : null,
      };
    });

    const groupedItems = new Map<string, typeof pickupItems>();
    for (const item of pickupItems) {
      const key = `${item.productId.toString()}::${item.variantId?.toString() ?? ""}`;
      const group = groupedItems.get(key) ?? [];
      group.push(item);
      groupedItems.set(key, group);
    }

    const items = Array.from(groupedItems.values()).map((group) => {
      const primary = group[0];
      return {
        ...primary,
        quantity: group.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      };
    });

    const subtotal = items.reduce((sum, item) => {
      const price = item.variant?.sellingPrice ?? item.variant?.price ?? item.product.sellingPrice;
      return sum + Number(price) * item.quantity;
    }, 0);

    return {
      ...cart,
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
    };
  }

  async addToCart(userId: string, productId: string, variantId?: string, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CartValidationError("Please select a valid quantity.");
    }

    const cart = await this.getOrCreateCart(userId);
    const product = await this.productRepository.findById(BigInt(productId));

    if (!product) throw new CartValidationError("Product not found.");
    if (!product.isActive) throw new CartValidationError("This product is no longer available.");

    if (product.hasVariants) {
      if (!variantId) throw new CartValidationError("Please select a product variant.");
      const variant = product.variants.find((entry) => entry.id === BigInt(variantId));
      if (!variant) throw new CartValidationError("The selected variant is not available.");
      const existingRows = await this.cartRepository.getCartWithItems(BigInt(userId));
      const currentQuantity = existingRows?.items
        .filter((item) => item.productId === BigInt(productId) && item.variantId === BigInt(variantId))
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;
      const pickupWarehouseId = await this.getPickupWarehouseId();
      const pickupStock = this.filterPickupWarehouseStock(variant.stock, pickupWarehouseId);
      validateStock(product, pickupStock, quantity, currentQuantity);
    } else {
      if (variantId) throw new CartValidationError("This product does not have selectable variants.");
      const existingRows = await this.cartRepository.getCartWithItems(BigInt(userId));
      const currentQuantity = existingRows?.items
        .filter((item) => item.productId === BigInt(productId) && item.variantId == null)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;
      const pickupWarehouseId = await this.getPickupWarehouseId();
      const pickupStock = this.filterPickupWarehouseStock(product.stock, pickupWarehouseId);
      validateStock(product, pickupStock, quantity, currentQuantity);
    }

    const pickupWarehouseId = await this.getPickupWarehouseId();
    const rawStockRows = product.hasVariants
      ? product.variants.find((entry) => entry.id === BigInt(variantId!))?.stock
      : product.stock;
    const stockRows = this.filterPickupWarehouseStock(rawStockRows, pickupWarehouseId);
    const stockState = getStockState(stockRows);
    const maxQuantity = product.allowOutOfStockOrders && stockState.isBelowThreshold ? 1 : stockState.available;

    return this.cartRepository.addOrIncrementItem({
      cartId: cart.id,
      productId: BigInt(productId),
      variantId: variantId ? BigInt(variantId) : undefined,
      quantity,
      maxQuantity,
    });
  }

  /**
   * Dedicated wishlist move-to-cart operation.
   * Existing cart quantity is preserved; a missing item is created at quantity 1.
   */
  async moveWishlistProductToCart(userId: string, productId: string) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) throw new CartValidationError("Product not found.");
    if (!product.isActive) {
      throw new CartValidationError("This product is no longer available.");
    }
    if (product.hasVariants) {
      throw new CartValidationError(
        "Please select a product variant from the product page before moving it to your cart.",
      );
    }

    const cart = await this.getOrCreateCart(userId);
    const cartWithItems = await this.cartRepository.getCartWithItems(BigInt(userId));
    const existingQuantity = cartWithItems?.items
      .filter(
        (item) =>
          item.productId === BigInt(productId) && item.variantId == null,
      )
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;

    const quantityToValidate = existingQuantity || 1;
    const pickupWarehouseId = await this.getPickupWarehouseId();
    const stockRows = this.filterPickupWarehouseStock(product.stock, pickupWarehouseId);
    validateStock(product, stockRows, quantityToValidate);

    const stockState = getStockState(stockRows);
    const maxQuantity = product.allowOutOfStockOrders && stockState.isBelowThreshold ? 1 : stockState.available;

    return this.cartRepository.addIfNotExists({
      cartId: cart.id,
      productId: BigInt(productId),
      quantity: 1,
      maxQuantity,
    });
  }

  async updateCartItem(userId: string, itemId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CartValidationError("Please select a valid quantity.");
    }

    const cartWithItems = await this.cartRepository.getCartWithItems(BigInt(userId));
    if (!cartWithItems) throw new CartValidationError("Cart not found.");

    const item = cartWithItems.items.find((candidate) => candidate.id === BigInt(itemId));
    if (!item) throw new CartValidationError("Cart item not found.");

    if (!item.product.isActive) {
      throw new CartValidationError(`${item.product.name} is no longer available.`);
    }

    const pickupWarehouseId = await this.getPickupWarehouseId();
    const rawStockRows = item.variantId ? item.variant?.stock : item.product.stock;
    const stockRows = this.filterPickupWarehouseStock(rawStockRows, pickupWarehouseId);
    validateStock(item.product, stockRows, quantity);
    const stockState = getStockState(stockRows);
    const maxQuantity = item.product.allowOutOfStockOrders && stockState.isBelowThreshold ? 1 : stockState.available;

    const matchingItems = cartWithItems.items.filter(
      (candidate) =>
        candidate.productId === item.productId &&
        (candidate.variantId ?? null) === (item.variantId ?? null),
    );

    return this.cartRepository.updateItem(item.id, quantity, maxQuantity);
  }

  async removeFromCart(userId: string, itemId: string) {
    const cartWithItems = await this.cartRepository.getCartWithItems(BigInt(userId));
    if (!cartWithItems) throw new Error("Cart not found");

    const item = cartWithItems.items.find((candidate) => candidate.id === BigInt(itemId));
    if (!item) throw new Error("Cart item not found");

    const matchingItems = cartWithItems.items.filter(
      (candidate) =>
        candidate.productId === item.productId &&
        (candidate.variantId ?? null) === (item.variantId ?? null),
    );
    for (const duplicate of matchingItems) await this.cartRepository.removeItem(duplicate.id);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.cartRepository.clearCart(cart.id);
  }

  async getItemCount(userId: string) {
    const cart = await this.cartRepository.findByUserId(BigInt(userId));
    if (!cart) return 0;
    return this.cartRepository.getItemCount(cart.id);
  }
}
