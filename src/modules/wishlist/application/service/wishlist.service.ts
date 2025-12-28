import { injectable, inject } from "tsyringe";
import { IWishlistRepository } from "../../infrastructure/interface/Iwishlistrepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";

@injectable()
export class WishlistService {
  constructor(
    @inject("IWishlistRepository")
    private wishlistRepository: IWishlistRepository,
    @inject("IProductRepository") private productRepository: IProductRepository
  ) {}

  async getOrCreateWishlist(userId: string) {
    const userIdBigInt = BigInt(userId);

    // Try to find existing wishlist
    let wishlist = await this.wishlistRepository.findByUserId(userIdBigInt);

    // If not found, create new wishlist
    if (!wishlist) {
      wishlist = await this.wishlistRepository.create(userIdBigInt);

      // Verify creation was successful
      if (!wishlist) {
        throw new Error("Failed to create wishlist");
      }
    }

    return wishlist;
  }

  async getWishlist(userId: string) {
    const wishlist = await this.wishlistRepository.getWishlistWithItems(
      BigInt(userId)
    );

    if (!wishlist) {
      return {
        items: [],
        totalItems: 0,
        isPublic: false,
      };
    }

    return {
      ...wishlist,
      totalItems: wishlist.items.length,
    };
  }

  async addToWishlist(userId: string, productId: string) {
    console.log("📝 Starting addToWishlist:", { userId, productId });

    // Validate product exists first
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }
    console.log("✅ Product found:", product.id);

    // Get or create wishlist
    const wishlist = await this.getOrCreateWishlist(userId);
    console.log("✅ Wishlist retrieved:", {
      wishlistId: wishlist.id.toString(),
      userId: wishlist.userId.toString(),
    });

    if (!wishlist || !wishlist.id) {
      throw new Error("Failed to create or retrieve wishlist");
    }

    // Check if item already exists
    const existingItem = await this.wishlistRepository.findItem(
      wishlist.id,
      BigInt(productId)
    );

    if (existingItem) {
      throw new Error("Product already in wishlist");
    }
    console.log("✅ Product not in wishlist, proceeding to add");

    // Add item to wishlist
    const result = await this.wishlistRepository.addItem({
      wishlistId: wishlist.id,
      productId: BigInt(productId),
    });

    console.log("✅ Item added successfully:", result.id);
    return result;
  }

  async removeFromWishlist(userId: string, itemId: string) {
    const wishlist = await this.getOrCreateWishlist(userId);

    // Verify item belongs to user's wishlist
    const wishlistWithItems =
      await this.wishlistRepository.getWishlistWithItems(BigInt(userId));
    const item = wishlistWithItems?.items.find((i) => i.id === BigInt(itemId));

    if (!item) {
      throw new Error("Wishlist item not found");
    }

    await this.wishlistRepository.removeItem(BigInt(itemId));
  }

  async clearWishlist(userId: string) {
    const wishlist = await this.getOrCreateWishlist(userId);
    await this.wishlistRepository.clearWishlist(wishlist.id);
  }

  async updateVisibility(userId: string, isPublic: boolean) {
    const wishlist = await this.getOrCreateWishlist(userId);
    return this.wishlistRepository.updateVisibility(wishlist.id, isPublic);
  }

  async isInWishlist(userId: string, productId: string): Promise<boolean> {
    const wishlist = await this.wishlistRepository.findByUserId(BigInt(userId));
    if (!wishlist) return false;

    const item = await this.wishlistRepository.findItem(
      wishlist.id,
      BigInt(productId)
    );
    return !!item;
  }
}
