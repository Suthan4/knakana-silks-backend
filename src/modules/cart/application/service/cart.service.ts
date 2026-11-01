import { injectable, inject } from "tsyringe";
import { ICartRepository } from "../../infrastructure/interface/Icartrepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";

class CartValidationError extends Error {
  statusCode = 409;
  code = "CART_STOCK_VALIDATION";
}

type StockRow = { quantity: number; lowStockThreshold: number };

function getStockState(stockRows: StockRow[] | undefined) {
  const rows = stockRows ?? [];
  const available = rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
  const threshold = rows.reduce((sum, row) => sum + Math.max(0, Number(row.lowStockThreshold) || 0), 0);
  return { available, threshold, isBelowThreshold: available > 0 && threshold > 0 && available <= threshold };
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

  // Zero stock is always unavailable, even when back-ordering is enabled.
  if (available <= 0) {
    throw new CartValidationError(`${productName} is out of stock.`);
  }

  if (isBelowThreshold) {
    if (!product.allowOutOfStockOrders) {
      throw new CartValidationError(
        `${productName} is out of stock. Only quantities above the stock threshold can be ordered.`,
      );
    }

    if (totalRequested > 1) {
      throw new CartValidationError(
        `${productName} has limited availability. Only 1 item can be ordered.`,
      );
    }
    return;
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
    @inject("IProductRepository") private productRepository: IProductRepository
  ) {}

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

    const groupedItems = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
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
      validateStock(product, variant.stock, quantity, currentQuantity);
    } else {
      if (variantId) throw new CartValidationError("This product does not have selectable variants.");
      const existingRows = await this.cartRepository.getCartWithItems(BigInt(userId));
      const currentQuantity = existingRows?.items
        .filter((item) => item.productId === BigInt(productId) && item.variantId == null)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;
      validateStock(product, product.stock, quantity, currentQuantity);
    }

    const stockRows = product.hasVariants
      ? product.variants.find((entry) => entry.id === BigInt(variantId!))?.stock
      : product.stock;
    const { available, isBelowThreshold } = getStockState(stockRows);
    const maxQuantity = isBelowThreshold && product.allowOutOfStockOrders ? 1 : available;

    return this.cartRepository.addOrIncrementItem({
      cartId: cart.id,
      productId: BigInt(productId),
      variantId: variantId ? BigInt(variantId) : undefined,
      quantity,
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

    const stockRows = item.variantId ? item.variant?.stock : item.product.stock;
    validateStock(item.product, stockRows, quantity);
    const { available, isBelowThreshold } = getStockState(stockRows);
    const maxQuantity = isBelowThreshold && item.product.allowOutOfStockOrders ? 1 : available;

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
