import "reflect-metadata";
import { container } from "tsyringe";
import { ICartRepository } from "./infrastructure/interface/Icartrepository.js";
import { CartRepository } from "./infrastructure/repository/CartRepository.js";
import { CartService } from "./application/service/cart.service.js";
import { CartController } from "./presentation/controller/cart.controller.js";


export function registerCartModule() {
  // Repositories
  container.register<ICartRepository>("ICartRepository", {
    useClass: CartRepository,
  });

  // Services
  container.registerSingleton(CartService);

  // Controllers
  container.registerSingleton(CartController);

  console.log("✅ Cart module registered");
}
