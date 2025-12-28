import "reflect-metadata";
import { container } from "tsyringe";
import { IProductRepository } from "./infrastructure/interface/Iproductrepository.js";
import { ProductRepository } from "./infrastructure/repository/ProductRepository.js";
import { ProductService } from "./application/service/product.service.js";
import { ProductController } from "./presentation/controller/prodcut.controller.js";

export function registerProductModule() {
  // Repositories
  container.register<IProductRepository>("IProductRepository", {
    useClass: ProductRepository,
  });

  // Services
  container.registerSingleton(ProductService);

  // Controllers
  container.registerSingleton(ProductController);

  console.log("✅ Product module registered");
}
