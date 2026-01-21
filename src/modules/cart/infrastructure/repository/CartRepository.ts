import { inject, injectable } from "tsyringe";
import { Cart, CartItem, PrismaClient } from "@/generated/prisma/client.js";
import {
  CartWithItems,
  ICartRepository,
} from "../interface/Icartrepository.js";

@injectable()
export class CartRepository implements ICartRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findByUserId(userId: bigint): Promise<Cart | null> {
    return this.prisma.cart.findUnique({
      where: { userId },
    });
  }

  async create(userId: bigint): Promise<Cart> {
    return this.prisma.cart.create({
      data: { userId },
    });
  }

  async addItem(data: {
    cartId: bigint;
    productId: bigint;
    variantId?: bigint;
    quantity: number;
  }): Promise<CartItem> {
    return this.prisma.cartItem.create({
      data: {
        cartId: data.cartId,
        productId: data.productId,
        variantId: data.variantId ?? null,
        quantity: data.quantity,
      },
      include: {
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
      },
    });
  }

  async updateItem(id: bigint, quantity: number): Promise<CartItem> {
    return this.prisma.cartItem.update({
      where: { id },
      data: { quantity },
      include: {
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
      },
    });
  }

  async removeItem(id: bigint): Promise<void> {
    await this.prisma.cartItem.delete({ where: { id } });
  }

  async findItem(
    cartId: bigint,
    productId: bigint,
    variantId?: bigint
  ): Promise<CartItem | null> {
      // ✅ CRITICAL FIX: Use proper query to leverage partial indexes
  
  if (variantId !== undefined && variantId !== null) {
    // For items WITH variants
    return this.prisma.cartItem.findFirst({
      where: {
        cartId,
        productId,
        variantId, // This will use the variantId index
      },
    });
  } else {
    // For items WITHOUT variants  
    return this.prisma.cartItem.findFirst({
      where: {
        cartId,
        productId,
        variantId: null, // This will use the no_variant index
      },
    });
  }
  }

async getCartWithItems(userId: bigint): Promise<CartWithItems | null> {
  return this.prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sellingPrice: true,
              basePrice: true,
              media: {
                take: 1,
                where: { isActive: true },
                orderBy: { order: "asc" },
              },
              stock: true,
            },
          },
          variant: {
            select: {
              id: true,
              price: true,
              sellingPrice: true, // ✅ IMPORTANT
              basePrice: true,    // ✅ optional but useful
              stock: true,
            },
          },
        },
      },
    },
  });
}


  async clearCart(cartId: bigint): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
  }

  async getItemCount(cartId: bigint): Promise<number> {
    return this.prisma.cartItem.count({ where: { cartId } });
  }
}
