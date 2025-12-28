import { inject, injectable } from "tsyringe";
import {
  Wishlist,
  WishlistItem,
  PrismaClient,
} from "@/generated/prisma/client.js";
import {
  IWishlistRepository,
  WishlistWithItems,
  WishlistItemWithProduct,
} from "../interface/Iwishlistrepository.js";

@injectable()
export class WishlistRepository implements IWishlistRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findByUserId(userId: bigint): Promise<Wishlist | null> {
    return this.prisma.wishlist.findUnique({
      where: { userId },
    });
  }

  async create(userId: bigint): Promise<Wishlist> {
    return this.prisma.wishlist.create({
      data: { userId },
    });
  }

  async addItem(data: {
    wishlistId: bigint;
    productId: bigint;
  }): Promise<WishlistItemWithProduct> {
    const { wishlistId, productId } = data;

    console.log("🔧 Repository addItem called with:", {
      wishlistId: wishlistId.toString(),
      productId: productId.toString(),
      wishlistIdType: typeof wishlistId,
      productIdType: typeof productId,
    });

    const result = await this.prisma.wishlistItem.create({
      data: {
        wishlistId,
        productId,
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { order: "asc" } },
            stock: true,
          },
        },
      },
    });

    console.log("✅ Repository addItem successful");
    return result;
  }

  async removeItem(id: bigint): Promise<void> {
    await this.prisma.wishlistItem.delete({ where: { id } });
  }

  async findItem(
    wishlistId: bigint,
    productId: bigint
  ): Promise<WishlistItem | null> {
    return this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId,
          productId,
        },
      },
    });
  }

  async getWishlistWithItems(
    userId: bigint
  ): Promise<WishlistWithItems | null> {
    return this.prisma.wishlist.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { order: "asc" } },
                stock: true,
                category: true,
              },
            },
          },
        },
      },
    });
  }

  async clearWishlist(wishlistId: bigint): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { wishlistId } });
  }

  async getItemCount(wishlistId: bigint): Promise<number> {
    return this.prisma.wishlistItem.count({ where: { wishlistId } });
  }

  async updateVisibility(
    wishlistId: bigint,
    isPublic: boolean
  ): Promise<Wishlist> {
    return this.prisma.wishlist.update({
      where: { id: wishlistId },
      data: { isPublic },
    });
  }
}
