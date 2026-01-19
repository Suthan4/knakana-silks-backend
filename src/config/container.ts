import { PrismaClient } from "@/generated/prisma/client.js";
import { registerAuthModule } from "@/modules/auth/container.js";
import { container } from "tsyringe";
import { getPrismaClient } from "@/lib/database/prisma.js";
import { registerCategoryModule } from "@/modules/category/container.js";
import { registerProductModule } from "@/modules/product/container.js";
import { registerAddressModule } from "@/modules/address/container.js";
import { registerCartModule } from "@/modules/cart/container.js";
import { registerWishlistModule } from "@/modules/wishlist/container.js";
import { registerBannerModule } from "@/modules/banner/container.js";
import { registerEmailModule } from "@/modules/notification/container.js";
import { registerHomeSectionModule } from "@/modules/home_section/container.js";
import { registerOrderModule } from "@/modules/order/container.js";
import { registerPaymentModule } from "@/modules/payment/container.js";
import { registerShipmentModule } from "@/modules/shipment/container.js";
import { registerCouponModule } from "@/modules/coupon/container.js";
import { registerConsultationModule } from "@/modules/consultation/container.js";
import { registerWarehouseModule } from "@/modules/warehouse/container.js";
// import { registerUploadModule } from "@/modules/upload/container.js";

export function setupContainer() {
  // Register PrismaClient instance instead of the class
  container.registerInstance(PrismaClient, getPrismaClient);

  registerAuthModule();
  // registerUploadModule();
  registerWarehouseModule();
  registerCategoryModule();
  registerProductModule();
  registerAddressModule();
  registerCartModule();
  registerWishlistModule();
  registerBannerModule()
  registerHomeSectionModule()
  registerCouponModule()
  registerOrderModule()
  registerPaymentModule()
  registerShipmentModule()
  registerEmailModule()
  registerConsultationModule()
  console.log("🎉 All modules registered successfully");
}
