import { container } from "tsyringe";
import { IStockRepository } from "./infrastructure/interface/Istockrepository.js";
import { StockManagementService } from "./application/stock.management.service.js";
import { StockRepository } from "./infrastructure/repository/stockRepository.js";
import { StockController } from "./presentation/controller/stock.controller.js";

export function registerStockModule() {
  container.register<IStockRepository>("IStockRepository", {
    useClass: StockRepository,
  });
  
  // service
  container.registerSingleton(StockManagementService);

  // controller
   container.registerSingleton(StockController);
  
  console.log("✅ Stock module registered");
}