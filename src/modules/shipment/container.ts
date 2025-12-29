import "reflect-metadata";
import { container } from "tsyringe";
import { IShipmentRepository } from "./infrastructure/interface/Ishipmentrepository.js";
import { ShipmentRepository } from "./infrastructure/repository/ShipmentRepository.js";
import { IShiprocketRepository } from "./infrastructure/interface/IshiprocketRepository.js";
import { ShiprocketRepository } from "./infrastructure/repository/ShiprocketRepository.js";
import { ShiprocketService } from "./infrastructure/services/shiprocket.service.js";
import { ShipmentService } from "./application/service/shipment.service.js";
import { ShipmentController } from "./presentation/controller/shipment.controller.js";

export function registerShipmentModule() {
  // Register Shiprocket Service (used by ShiprocketRepository)
  container.registerSingleton(ShiprocketService);

  // Register Repositories
  container.register<IShipmentRepository>("IShipmentRepository", {
    useClass: ShipmentRepository,
  });

  container.register<IShiprocketRepository>("IShiprocketRepository", {
    useClass: ShiprocketRepository,
  });

  // Register Services
  container.registerSingleton(ShipmentService);

  // Register Controllers
  container.registerSingleton(ShipmentController);

  console.log("✅ Shipment module registered (with Shiprocket Repository)");
}
