import { PrismaClient } from "@/generated/prisma/client.js";
import { registerAuthModule } from "@/modules/auth/container.js";
import { container } from "tsyringe";
import { getPrismaClient } from "@/lib/database/prisma.js";
import { registerCategoryModule } from "@/modules/category/container.js";
import { registerProductModule } from "@/modules/product/container.js";
import { registerAddressModule } from "@/modules/address/container.js";
import { registerCartModule } from "@/modules/cart/container.js";
import { registerWishlistModule } from "@/modules/wishlist/container.js";

export function setupContainer() {
  // Register PrismaClient instance instead of the class
  container.registerInstance(PrismaClient, getPrismaClient);

  registerAuthModule();
  registerCategoryModule();
  registerProductModule();
  registerAddressModule();
  registerCartModule();
  registerWishlistModule();
  console.log("🎉 All modules registered successfully");
}
