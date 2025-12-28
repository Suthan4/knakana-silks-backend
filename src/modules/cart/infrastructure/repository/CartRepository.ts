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
        variantId: data.variantId ?? null, // Use nullish coalescing
        quantity: data.quantity,
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { order: "asc" } },
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
            images: { take: 1, orderBy: { order: "asc" } },
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
    if (variantId !== undefined) {
      // Variant provided - use unique constraint
      return this.prisma.cartItem.findUnique({
        where: {
          cartId_productId_variantId: {
            cartId,
            productId,
            variantId, // ✅ All fields present
          },
        },
      });
    } else {
      // No variant - use findFirst with null check
      return this.prisma.cartItem.findFirst({
        where: {
          cartId,
          productId,
          variantId: null, // ✅ Explicitly null in where clause
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
              include: {
                images: { take: 1, orderBy: { order: "asc" } },
                stock: true,
              },
            },
            variant: {
              include: {
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
