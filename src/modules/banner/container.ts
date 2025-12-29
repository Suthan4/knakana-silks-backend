import "reflect-metadata";
import { container } from "tsyringe";
import { IBannerRepository } from "./infrastructure/interface/Ibannerrepository.js";
import { BannerService } from "./application/service/banner.service.js";
import { BannerController } from "./presentation/controller/banner.controller.js";
import { BannerRepository } from "./infrastructure/repository/bannerRepository.js";

export function registerBannerModule() {
  // Repositories
  container.register<IBannerRepository>("IBannerRepository", {
    useClass: BannerRepository,
  });

  // Services
  container.registerSingleton(BannerService);

  // Controllers
  container.registerSingleton(BannerController);

  console.log("✅ Banner module registered");
}
