import "reflect-metadata";
import { container } from "tsyringe";
import { IProductRepository } from "./infrastructure/interface/Iproductrepository.js";
import { ProductRepository } from "./infrastructure/repository/ProductRepository.js";
import { ProductService } from "./application/service/product.service.js";
import { ProductController } from "./presentation/controller/prodcut.controller.js";
import { BulkProductService } from "./application/service/bulk-product.service.js";
import { BulkProductController } from "./presentation/controller/bulk-product.controller.js";

export function registerProductModule() {
  // Repositories
  container.register<IProductRepository>("IProductRepository", {
    useClass: ProductRepository,
  });

  // Services
  container.registerSingleton(ProductService);
  container.registerSingleton(BulkProductService);

  // Controllers
  container.registerSingleton(ProductController);
  container.registerSingleton(BulkProductController);

  console.log("✅ Product module registered");
}
