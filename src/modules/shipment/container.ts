import "reflect-metadata";
import { container } from "tsyringe";
import { ShiprocketService } from "./application/service/shiprocket.service.js";

export function registerShipmentModule() {
  // Services
  container.registerSingleton(ShiprocketService);

  console.log("✅ Shipment module registered");
}
