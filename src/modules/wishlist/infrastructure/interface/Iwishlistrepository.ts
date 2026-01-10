import { Wishlist, WishlistItem, Prisma } from "@/generated/prisma/client.js";

// Define a type for Wishlist with items included
export type WishlistWithItems = Prisma.WishlistGetPayload<{
  include: {
    items: {
      include: {
        product: {
          include: {
            media: true;
            stock: true;
            category: true;
          };
        };
      };
    };
  };
}>;

// Define a type for WishlistItem with product included
export type WishlistItemWithProduct = Prisma.WishlistItemGetPayload<{
  include: {
    product: {
      include: {
        media: true;
        stock: true;
      };
    };
  };
}>;

export interface IWishlistRepository {
  findByUserId(userId: bigint): Promise<Wishlist | null>;
  create(userId: bigint): Promise<Wishlist>;
  addItem(data: {
    wishlistId: bigint;
    productId: bigint;
  }): Promise<WishlistItemWithProduct>;
  removeItem(id: bigint): Promise<void>;
  findItem(wishlistId: bigint, productId: bigint): Promise<WishlistItem | null>;
  getWishlistWithItems(userId: bigint): Promise<WishlistWithItems | null>;
  clearWishlist(wishlistId: bigint): Promise<void>;
  getItemCount(wishlistId: bigint): Promise<number>;
  updateVisibility(wishlistId: bigint, isPublic: boolean): Promise<Wishlist>;
}
