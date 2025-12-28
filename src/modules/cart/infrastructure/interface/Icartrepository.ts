import { Cart, CartItem, Prisma } from "@/generated/prisma/client.js";

// Define a type for Cart with items included
// Define type that includes the relations
export type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        product: { include: { images: true; stock: true } };
        variant: { include: { stock: true } };
      };
    };
  };
}>;


export interface ICartRepository {
  findByUserId(userId: bigint): Promise<Cart | null>;
  create(userId: bigint): Promise<Cart>;
  addItem(data: {
    cartId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
  }): Promise<CartItem>;
  updateItem(id: bigint, quantity: number): Promise<CartItem>;
  removeItem(id: bigint): Promise<void>;
  findItem(
    cartId: bigint,
    productId: bigint,
    variantId?: bigint
  ): Promise<CartItem | null>;
  getCartWithItems(userId: bigint): Promise<CartWithItems | null>;
  clearCart(cartId: bigint): Promise<void>;
  getItemCount(cartId: bigint): Promise<number>;
}
