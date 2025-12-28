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

    // Calculate subtotal
    const subtotal = cart.items.reduce((sum, item) => {
      const price = item.variant
        ? item.variant.price
        : item.product.sellingPrice;
      return sum + Number(price) * item.quantity;
    }, 0);

    return {
      ...cart,
      totalItems: cart.items.length,
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

    // Check if item already exists in cart
    const existingItem = await this.cartRepository.findItem(
      cart.id,
      BigInt(productId),
      variantId ? BigInt(variantId) : undefined
    );

    if (existingItem) {
      // Update quantity
      return this.cartRepository.updateItem(
        existingItem.id,
        existingItem.quantity + quantity
      );
    }

    // Add new item
    return this.cartRepository.addItem({
      cartId: cart.id,
      productId: BigInt(productId),
      variantId: variantId ? BigInt(variantId) : undefined,
      quantity,
    });
  }

  async updateCartItem(userId: string, itemId: string, quantity: number) {
    // Get cart with items to verify ownership
    const cartWithItems = await this.cartRepository.getCartWithItems(
      BigInt(userId)
    );

    if (!cartWithItems) {
      throw new Error("Cart not found");
    }

    const item = cartWithItems.items.find((i) => i.id === BigInt(itemId));

    if (!item) {
      throw new Error("Cart item not found");
    }

    return this.cartRepository.updateItem(BigInt(itemId), quantity);
  }

  async removeFromCart(userId: string, itemId: string) {
    // Get cart with items to verify ownership
    const cartWithItems = await this.cartRepository.getCartWithItems(
      BigInt(userId)
    );

    if (!cartWithItems) {
      throw new Error("Cart not found");
    }

    const item = cartWithItems.items.find((i) => i.id === BigInt(itemId));

    if (!item) {
      throw new Error("Cart item not found");
    }

    await this.cartRepository.removeItem(BigInt(itemId));
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
