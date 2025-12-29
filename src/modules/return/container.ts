import "reflect-metadata";
import { container } from "tsyringe";
import { IReturnRepository } from "./infrastructure/interface/Ireturnrepository.js";
import { ReturnRepository } from "./infrastructure/repository/returnRepository.js";
import { ReturnService } from "./application/service/return.service.js";
import { ReturnController } from "./presentation/controller/return.controller.js";

export function registerReturnModule() {
  // Repositories
  container.register<IReturnRepository>("IReturnRepository", {
    useClass: ReturnRepository,
  });

  // Services
  container.registerSingleton(ReturnService);

  // Controllers
  container.registerSingleton(ReturnController);

  console.log("✅ Return module registered");
}
