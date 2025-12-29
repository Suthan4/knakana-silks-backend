import "reflect-metadata";
import { container } from "tsyringe";
import { ICouponRepository } from "./infrastructure/interface/Icouponrepository.js";
import { CouponRepository } from "./infrastructure/repository/couponRepository.js";
import { CouponService } from "./application/service/coupon.service.js";
import { CouponController } from "./presentation/controller/coupon.controller.js";

export function registerCouponModule() {
  // Repositories
  container.register<ICouponRepository>("ICouponRepository", {
    useClass: CouponRepository,
  });

  // Services
  container.registerSingleton(CouponService);

  // Controllers
  container.registerSingleton(CouponController);

  console.log("✅ Coupon module registered");
}
