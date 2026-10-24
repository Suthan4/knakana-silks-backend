import "reflect-metadata";
import { container } from "tsyringe";
import { IProductRepository } from "./infrastructure/interface/Iproductrepository.js";
import { ProductRepository } from "./infrastructure/repository/ProductRepository.js";
import { ProductService } from "./application/service/product.service.js";
import { ProductController } from "./presentation/controller/prodcut.controller.js";
import { BulkProductService } from "./application/service/bulk-product.service.js";
import { BulkProductController } from "./presentation/controller/bulk-product.controller.js";
import { BulkImportDraftRepository } from "./infrastructure/repository/bulk-import-draft.repository.js";
import { BulkImportDraftService } from "./application/bulk/bulk-import-draft.service.js";
import { BulkImportJobService } from "./application/bulk/bulk-import-job.service.js";
import { BulkImportDraftController } from "./presentation/controller/bulk-import-draft.controller.js";
import { DriveImageMatcherService } from "./application/bulk/drive-image-matcher.service.js";
import { DriveService } from "@/modules/media/infrastructure/drive.service.js";

export function registerProductModule() {
  // Repositories
  container.register<IProductRepository>("IProductRepository", {
    useClass: ProductRepository,
  });
  container.registerSingleton(BulkImportDraftRepository);

  // Services
  container.registerSingleton(ProductService);
  container.registerSingleton(BulkProductService);
  container.registerSingleton(DriveService);
  container.register("DriveService", { useToken: DriveService });
  container.registerSingleton(DriveImageMatcherService);
  container.registerSingleton(BulkImportJobService);
  container.registerSingleton(BulkImportDraftService);

  // Controllers
  container.registerSingleton(ProductController);
  container.registerSingleton(BulkProductController);
  container.registerSingleton(BulkImportDraftController);

  console.log("✅ Product module registered");
}
