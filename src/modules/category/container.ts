import "reflect-metadata";
import { container } from "tsyringe";
import { ICategoryRepository } from "./infrastructure/interface/Icategoryrepository.js";
import { CategoryRepository } from "./infrastructure/repository/CategoryRepository.js";
import { CategoryService } from "./application/service/category.service.js";
import { CategoryController } from "./presentation/controller/category.controller.js";

export function registerCategoryModule() {
  // Repositories
  container.register<ICategoryRepository>("ICategoryRepository", {
    useClass: CategoryRepository,
  });

  // Services
  container.registerSingleton(CategoryService);

  // Controllers
  container.registerSingleton(CategoryController);

  console.log("✅ Category module registered");
}
