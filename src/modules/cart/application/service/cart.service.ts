
import { injectable, inject } from "tsyringe";
import { ICartRepository } from "../../infrastructure/interface/Icartrepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";
import { PrismaClient } from "@/generated/prisma/client.js";

class CartValidationError extends Error {
  statusCode = 409;
  code = "CART_STOCK_VALIDATION";
}

type StockRow = {
  warehouseId: bigint;
  quantity: number;
  lowStockThreshold: number;
};

type StockState = {
  available: number;
  threshold: number;
  isAtOrBelowThreshold: boolean;
};

/**
 * Centralized stock calculation.
 */
function getStockState(
  stockRows: StockRow[] | undefined
): StockState {
  const rows = stockRows ?? [];

  const available = rows.reduce(
    (sum, row) =>
      sum + Math.max(0, Number(row.quantity) || 0),
    0
  );

  const threshold = rows.reduce(
    (sum, row) =>
      sum + Math.max(0, Number(row.lowStockThreshold) || 0),
    0
  );

  const isAtOrBelowThreshold =
    available > 0 &&
    threshold > 0 &&
    available <= threshold;

  return {
    available,
    threshold,
    isAtOrBelowThreshold,
  };
}

/**
 * Centralized maximum quantity calculation.
 */
function getMaxOrderQuantity(
  product: { allowOutOfStockOrders?: boolean },
  stockState: StockState
): number {
  if (stockState.available <= 0) {
    return 0;
  }

  // When enabled, maximum order quantity is always 1.
  if (product.allowOutOfStockOrders) {
    return 1;
  }

  // When disabled, the threshold is enforced by validateStock.
  return stockState.available;
}

/**
 * Centralized stock validation.
 *
 * Rules:
 * 1. Physical stock zero: always block.
 * 2. allowOutOfStockOrders true: maximum 1 unit.
 * 3. allowOutOfStockOrders false: stock must be
 *    strictly greater than the threshold.
 * 4. Never allow ordering beyond physical stock.
 */
function validateStock(
  product: {
    allowOutOfStockOrders?: boolean;
    name?: string;
  },
  stockRows: StockRow[] | undefined,
  requestedQuantity: number,
  currentQuantity = 0
): void {
  if (
    !Number.isInteger(requestedQuantity) ||
    requestedQuantity < 1
  ) {
    throw new CartValidationError(
      "Please select a valid quantity."
    );
  }

  const stockState = getStockState(stockRows);

  const {
    available,
    isAtOrBelowThreshold,
  } = stockState;

  const totalRequested =
    currentQuantity + requestedQuantity;

  const productName = product.name || "This product";

  // Rule 1: Zero physical stock is always unavailable.
  if (available <= 0) {
    throw new CartValidationError(
      `${productName} is out of stock.`
    );
  }

  // Rule 2: When allowOutOfStockOrders is enabled,
  // allow only one unit regardless of the threshold.
  if (product.allowOutOfStockOrders) {
    if (totalRequested > 1) {
      throw new CartValidationError(
        `Only 1 item of ${productName} can be ordered.`
      );
    }

    return;
  }

  // Rule 3: When disabled, stock must be greater
  // than the minimum threshold.
  if (isAtOrBelowThreshold) {
    throw new CartValidationError(
      `${productName} is currently unavailable because stock is at or below the minimum threshold.`
    );
  }

  // Rule 4: Never exceed actual physical stock.
  if (totalRequested > available) {
    throw new CartValidationError(
      `Only ${available} item(s) of ${productName} are available.`
    );
  }
}

@injectable()
export class CartService {
  constructor(
    @inject("ICartRepository")
    private cartRepository: ICartRepository,

    @inject("IProductRepository")
    private productRepository: IProductRepository,

    @inject(PrismaClient)
    private prisma: PrismaClient
  ) {}

  /**
   * Cart mutations and order preview/reservation must use
   * the same warehouse.
   *
   * Orders ship from the active default-pickup warehouse,
   * falling back to the first active warehouse.
   */
  private async getPickupWarehouseId(): Promise<bigint | null> {
    const defaultWarehouse =
      await this.prisma.warehouse.findFirst({
        where: {
          isDefaultPickup: true,
          isActive: true,
        },
        orderBy: { id: "asc" },
        select: { id: true },
      });

    if (defaultWarehouse) {
      return defaultWarehouse.id;
    }

    const fallbackWarehouse =
      await this.prisma.warehouse.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });

    return fallbackWarehouse?.id ?? null;
  }

  /**
   * Always use the selected pickup warehouse.
   * If there is no active warehouse, return no stock.
   */
  private filterPickupWarehouseStock<
    T extends { warehouseId: bigint }
  >(
    rows: T[] | undefined,
    warehouseId: bigint | null
  ): T[] {
    if (!rows || !warehouseId) {
      return [];
    }

    return rows.filter(
      (row) => row.warehouseId === warehouseId
    );
  }

  async getOrCreateCart(userId: string) {
    const userIdBigInt = BigInt(userId);

    let cart =
      await this.cartRepository.findByUserId(userIdBigInt);

    if (!cart) {
      cart =
        await this.cartRepository.create(userIdBigInt);
    }

    return cart;
  }

  async getCart(userId: string) {
    const cart =
      await this.cartRepository.getCartWithItems(
        BigInt(userId)
      );

    if (!cart) {
      return {
        items: [],
        totalItems: 0,
        subtotal: 0,
      };
    }

    const pickupWarehouseId =
      await this.getPickupWarehouseId();

    // Resolve legacy cart items with a missing variantId
    // only when the product has exactly one variant.
    const unresolvedProductIds = Array.from(
      new Set(
        cart.items
          .filter(
            (item) =>
              !item.variantId &&
              item.product.hasVariants
          )
          .map((item) => item.productId)
      )
    );

    const legacyVariants = unresolvedProductIds.length
      ? await this.prisma.productVariant.findMany({
          where: {
            productId: {
              in: unresolvedProductIds,
            },
          },
          include: {
            stock: true,
          },
        })
      : [];

    const variantsByProduct = new Map<
      string,
      typeof legacyVariants
    >();

    for (const variant of legacyVariants) {
      const key = variant.productId.toString();

      const rows =
        variantsByProduct.get(key) ?? [];

      rows.push(variant);
      variantsByProduct.set(key, rows);
    }

    const pickupItems = cart.items.map((item) => {
      const candidates =
        variantsByProduct.get(
          item.productId.toString()
        ) ?? [];

      const inferredVariant =
        !item.variantId &&
        item.product.hasVariants &&
        candidates.length === 1
          ? candidates[0]
          : null;

      const resolvedVariant =
        item.variant ?? inferredVariant;

      const resolvedVariantId =
        item.variantId ??
        inferredVariant?.id ??
        null;

      const productStock =
        this.filterPickupWarehouseStock(
          item.product.stock,
          pickupWarehouseId
        ).filter((row) =>
          resolvedVariantId
            ? row.variantId === resolvedVariantId
            : row.variantId == null
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
                pickupWarehouseId
              ),
            }
          : null,
      };
    });

    // Group duplicate product + variant combinations.
    const groupedItems = new Map<
      string,
      typeof pickupItems
    >();

    for (const item of pickupItems) {
      const key =
        `${item.productId.toString()}::` +
        `${item.variantId?.toString() ?? ""}`;

      const group = groupedItems.get(key) ?? [];

      group.push(item);
      groupedItems.set(key, group);
    }

    const items = Array.from(
      groupedItems.values()
    ).map((group) => {
      const primary = group[0];

      return {
        ...primary,
        quantity: group.reduce(
          (sum, item) =>
            sum + Number(item.quantity || 0),
          0
        ),
      };
    });

    const subtotal = items.reduce((sum, item) => {
      const price =
        item.variant?.sellingPrice ??
        item.variant?.price ??
        item.product.sellingPrice;

      return sum + Number(price) * item.quantity;
    }, 0);

    return {
      ...cart,
      items,
      totalItems: items.reduce(
        (sum, item) => sum + item.quantity,
        0
      ),
      subtotal,
    };
  }

  /**
   * ADD TO CART
   */
  async addToCart(
    userId: string,
    productId: string,
    variantId?: string,
    quantity = 1
  ) {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new CartValidationError(
        "Please select a valid quantity."
      );
    }

    const cart =
      await this.getOrCreateCart(userId);

    const product =
      await this.productRepository.findById(
        BigInt(productId)
      );

    if (!product) {
      throw new CartValidationError(
        "Product not found."
      );
    }

    if (!product.isActive) {
      throw new CartValidationError(
        "This product is no longer available."
      );
    }

    const pickupWarehouseId =
      await this.getPickupWarehouseId();

    const existingRows =
      await this.cartRepository.getCartWithItems(
        BigInt(userId)
      );

    let currentQuantity = 0;
    let rawStockRows:
      | StockRow[]
      | undefined;

    if (product.hasVariants) {
      if (!variantId) {
        throw new CartValidationError(
          "Please select a product variant."
        );
      }

      const variant = product.variants.find(
        (entry) =>
          entry.id === BigInt(variantId)
      );

      if (!variant) {
        throw new CartValidationError(
          "The selected variant is not available."
        );
      }

      currentQuantity =
        existingRows?.items
          .filter(
            (item) =>
              item.productId === BigInt(productId) &&
              item.variantId === BigInt(variantId)
          )
          .reduce(
            (sum, item) =>
              sum + Number(item.quantity || 0),
            0
          ) ?? 0;

      rawStockRows = variant.stock;
    } else {
      if (variantId) {
        throw new CartValidationError(
          "This product does not have selectable variants."
        );
      }

      currentQuantity =
        existingRows?.items
          .filter(
            (item) =>
              item.productId === BigInt(productId) &&
              item.variantId == null
          )
          .reduce(
            (sum, item) =>
              sum + Number(item.quantity || 0),
            0
          ) ?? 0;

      rawStockRows = product.stock;
    }

    const stockRows =
      this.filterPickupWarehouseStock(
        rawStockRows,
        pickupWarehouseId
      );

    // Validate existing cart quantity + requested quantity.
    validateStock(
      product,
      stockRows,
      quantity,
      currentQuantity
    );

    const stockState =
      getStockState(stockRows);

    const maxQuantity =
      getMaxOrderQuantity(
        product,
        stockState
      );

    return this.cartRepository.addOrIncrementItem({
      cartId: cart.id,
      productId: BigInt(productId),
      variantId: variantId
        ? BigInt(variantId)
        : undefined,
      quantity,
      maxQuantity,
    });
  }

  /**
   * MOVE WISHLIST PRODUCT TO CART
   *
   * Existing cart quantity is preserved.
   * A missing item is created at quantity 1.
   */
  async moveWishlistProductToCart(
    userId: string,
    productId: string
  ) {
    const product =
      await this.productRepository.findById(
        BigInt(productId)
      );

    if (!product) {
      throw new CartValidationError(
        "Product not found."
      );
    }

    if (!product.isActive) {
      throw new CartValidationError(
        "This product is no longer available."
      );
    }

    if (product.hasVariants) {
      throw new CartValidationError(
        "Please select a product variant from the product page before moving it to your cart."
      );
    }

    const cart =
      await this.getOrCreateCart(userId);

    const cartWithItems =
      await this.cartRepository.getCartWithItems(
        BigInt(userId)
      );

    const existingQuantity =
      cartWithItems?.items
        .filter(
          (item) =>
            item.productId === BigInt(productId) &&
            item.variantId == null
        )
        .reduce(
          (sum, item) =>
            sum + Number(item.quantity || 0),
          0
        ) ?? 0;

    const pickupWarehouseId =
      await this.getPickupWarehouseId();

    const stockRows =
      this.filterPickupWarehouseStock(
        product.stock,
        pickupWarehouseId
      );

    // Validate the existing quantity, or one unit if new.
    const quantityToValidate =
      existingQuantity || 1;

    validateStock(
      product,
      stockRows,
      quantityToValidate
    );

    const stockState =
      getStockState(stockRows);

    const maxQuantity =
      getMaxOrderQuantity(
        product,
        stockState
      );

    return this.cartRepository.addIfNotExists({
      cartId: cart.id,
      productId: BigInt(productId),
      quantity: 1,
      maxQuantity,
    });
  }

  /**
   * UPDATE CART ITEM QUANTITY
   */
  async updateCartItem(
    userId: string,
    itemId: string,
    quantity: number
  ) {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new CartValidationError(
        "Please select a valid quantity."
      );
    }

    const cartWithItems =
      await this.cartRepository.getCartWithItems(
        BigInt(userId)
      );

    if (!cartWithItems) {
      throw new CartValidationError(
        "Cart not found."
      );
    }

    const item = cartWithItems.items.find(
      (candidate) =>
        candidate.id === BigInt(itemId)
    );

    if (!item) {
      throw new CartValidationError(
        "Cart item not found."
      );
    }

    if (!item.product.isActive) {
      throw new CartValidationError(
        `${item.product.name} is no longer available.`
      );
    }

    const pickupWarehouseId =
      await this.getPickupWarehouseId();

    // Resolve legacy items only when exactly one variant exists.
    let resolvedVariant = item.variant;

    let resolvedVariantId =
      item.variantId ?? item.variant?.id;

    if (
      !resolvedVariantId &&
      item.product.hasVariants
    ) {
      const variants =
        await this.prisma.productVariant.findMany({
          where: {
            productId: item.productId,
          },
          include: {
            stock: true,
          },
        });

      if (variants.length !== 1) {
        throw new CartValidationError(
          "Please remove this item and select its variant again before updating the cart."
        );
      }

      resolvedVariant = variants[0];
      resolvedVariantId = variants[0].id;
    }

    const rawStockRows = resolvedVariantId
      ? resolvedVariant?.stock
      : item.product.stock;

    const stockRows =
      this.filterPickupWarehouseStock(
        rawStockRows,
        pickupWarehouseId
      );

    // For an update, quantity represents the new desired
    // quantity, not an additional quantity.
    validateStock(
      item.product,
      stockRows,
      quantity
    );

    const stockState =
      getStockState(stockRows);

    const maxQuantity =
      getMaxOrderQuantity(
        item.product,
        stockState
      );

    return this.cartRepository.updateItem(
      item.id,
      quantity,
      maxQuantity
    );
  }

  /**
   * REMOVE CART ITEM
   *
   * Removes duplicate rows for the same product + variant.
   */
  async removeFromCart(
    userId: string,
    itemId: string
  ) {
    const cartWithItems =
      await this.cartRepository.getCartWithItems(
        BigInt(userId)
      );

    if (!cartWithItems) {
      throw new Error("Cart not found");
    }

    const item = cartWithItems.items.find(
      (candidate) =>
        candidate.id === BigInt(itemId)
    );

    if (!item) {
      throw new Error("Cart item not found");
    }

    const matchingItems =
      cartWithItems.items.filter(
        (candidate) =>
          candidate.productId === item.productId &&
          (candidate.variantId ?? null) ===
            (item.variantId ?? null)
      );

    for (const duplicate of matchingItems) {
      await this.cartRepository.removeItem(
        duplicate.id
      );
    }
  }

  /**
   * CLEAR CART
   */
  async clearCart(userId: string) {
    const cart =
      await this.getOrCreateCart(userId);

    await this.cartRepository.clearCart(
      cart.id
    );
  }

  /**
   * GET CART ITEM COUNT
   */
  async getItemCount(userId: string) {
    const cart =
      await this.cartRepository.findByUserId(
        BigInt(userId)
      );

    if (!cart) {
      return 0;
    }

    return this.cartRepository.getItemCount(
      cart.id
    );
  }
}
