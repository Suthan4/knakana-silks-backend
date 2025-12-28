import "reflect-metadata";
import { container } from "tsyringe";
import { IWishlistRepository } from "./infrastructure/interface/Iwishlistrepository.js";
import { WishlistRepository } from "./infrastructure/repository/WishlistRepository.js";
import { WishlistService } from "./application/service/wishlist.service.js";
import { WishlistController } from "./presentation/controller/wishlist.controller.js";


export function registerWishlistModule() {
  // Repositories
  container.register<IWishlistRepository>("IWishlistRepository", {
    useClass: WishlistRepository,
  });

  // Services
  container.registerSingleton(WishlistService);

  // Controllers
  container.registerSingleton(WishlistController);

  console.log("✅ Wishlist module registered");
}
