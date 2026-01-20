import "reflect-metadata";
import { container } from "tsyringe";
import { IProductRequestRepository } from "./infrastructure/interface/Iproductrequest.repository.js";
import { ProductRequestRepository } from "./infrastructure/repository/ProductRequestRepository.js";
import { ProductRequestService } from "./application/service/product-request.service.js";
import { ProductRequestController } from "./presentation/controller/product-request.controller.js";

export function registerProductRequestModule() {
  container.register<IProductRequestRepository>("IProductRequestRepository", {
    useClass: ProductRequestRepository,
  });

  container.registerSingleton(ProductRequestService);
  container.registerSingleton(ProductRequestController);

  console.log("✅ Product Request module registered");
}