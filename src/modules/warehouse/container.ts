import "reflect-metadata";
import { container } from "tsyringe";
import { IWarehouseRepository } from "./infrastructure/interface/Iwarehouserepository.js";
import { WarehouseRepository } from "./infrastructure/repository/warehouseRepository.js";
import { WarehouseService } from "./application/service/warehouse.service.js";
import { WarehouseController } from "./presentation/controller/warehouse.controller.js";

export function registerWarehouseModule() {
  // Repositories
  container.register<IWarehouseRepository>("IWarehouseRepository", {
    useClass: WarehouseRepository,
  });

  // Services
  container.registerSingleton(WarehouseService);

  // Controllers
  container.registerSingleton(WarehouseController);

  console.log("✅ Warehouse module registered");
}
