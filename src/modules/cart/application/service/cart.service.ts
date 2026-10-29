import { injectable, inject } from "tsyringe";
import { ICartRepository } from "../../infrastructure/interface/Icartrepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";


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
      return {
        items: [],
        totalItems: 0,
        subtotal: 0,
      };
    }

    // Legacy carts can contain duplicate rows for the same product/variant.
    // Normalize the read response to one visible line and a summed quantity.
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
      const price =
        item.variant?.sellingPrice ??
        item.variant?.price ??
        item.product.sellingPrice;
      return sum + Number(price) * item.quantity;
    }, 0);

    return {
      ...cart,
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
    };
  }

  async addToCart(
    userId: string,
    productId: string,
    variantId?: string,
    quantity: number = 1
  ) {
    const cart = await this.getOrCreateCart(userId);

    // Validate product exists
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    if (!product.isActive) {
      throw new Error("Product is not available");
    }
    // Consolidate any legacy duplicate rows before incrementing quantity.
    // This also prevents additional duplicates if the cart already contains them.
    const cartWithItems = await this.cartRepository.getCartWithItems(BigInt(userId));
    const variantIdBigInt = variantId ? BigInt(variantId) : undefined;
    const matchingItems = (cartWithItems?.items ?? []).filter(
      (item) =>
        item.productId === BigInt(productId) &&
        (item.variantId ?? null) === (variantIdBigInt ?? null),
    );

    if (matchingItems.length > 0) {
      const primary = matchingItems[0];
      const nextQuantity =
        matchingItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0) + quantity;
      const updated = await this.cartRepository.updateItem(primary.id, nextQuantity);

      for (const duplicate of matchingItems.slice(1)) {
        await this.cartRepository.removeItem(duplicate.id);
      }
      return updated;
    }

    return this.cartRepository.addItem({
      cartId: cart.id,
      productId: BigInt(productId),
      variantId: variantIdBigInt,
      quantity,
    });
  }

  async updateCartItem(userId: string, itemId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }

    const cartWithItems = await this.cartRepository.getCartWithItems(BigInt(userId));
    if (!cartWithItems) throw new Error("Cart not found");

    const item = cartWithItems.items.find((candidate) => candidate.id === BigInt(itemId));
    if (!item) throw new Error("Cart item not found");

    const matchingItems = cartWithItems.items.filter(
      (candidate) =>
        candidate.productId === item.productId &&
        (candidate.variantId ?? null) === (item.variantId ?? null),
    );
    const updated = await this.cartRepository.updateItem(item.id, quantity);

    // One visible line should represent exactly one product + variant.
    for (const duplicate of matchingItems) {
      if (duplicate.id !== item.id) {
        await this.cartRepository.removeItem(duplicate.id);
      }
    }

    return updated;
  }

  async removeFromCart(userId: string, itemId: string) {
    const cartWithItems = await this.cartRepository.getCartWithItems(BigInt(userId));
    if (!cartWithItems) throw new Error("Cart not found");

    const item = cartWithItems.items.find((candidate) => candidate.id === BigInt(itemId));
    if (!item) throw new Error("Cart item not found");

    // Remove all legacy rows representing this product/variant, not only the
    // first duplicate row selected by the UI.
    const matchingItems = cartWithItems.items.filter(
      (candidate) =>
        candidate.productId === item.productId &&
        (candidate.variantId ?? null) === (item.variantId ?? null),
    );
    for (const duplicate of matchingItems) {
      await this.cartRepository.removeItem(duplicate.id);
    }
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
