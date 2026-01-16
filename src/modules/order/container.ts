import "reflect-metadata";
import { container } from "tsyringe";
import { IOrderRepository } from "./infrastructure/interface/Iorderrepository.js";
import { OrderService } from "./application/service/order.service.js";
import { OrderController } from "./presentation/controller/order.controller.js";
import { OrderRepository } from "./infrastructure/repository/orderRepository.js";
import { OrderShippingInfoRepository } from "./infrastructure/repository/orderShippingInfoRepository.js";
import { IOrderShippingInfoRepository } from "./infrastructure/interface/Iordershippinginforepository.js";

/**
 * Register Order Module with Normalized Shipping Info
 * 
 * This version uses a separate OrderShippingInfo table for storing
 * warehouse and shipping dimension data.
 */
export function registerOrderModule() {
  // Register Repositories
  container.register<IOrderRepository>("IOrderRepository", {
    useClass: OrderRepository,
  });

  // 🆕 Register OrderShippingInfo Repository
  container.register<IOrderShippingInfoRepository>(
    "IOrderShippingInfoRepository",
    {
      useClass: OrderShippingInfoRepository,
    }
  );

  // Register Services
  container.registerSingleton(OrderService);

  // Register Controllers
  container.registerSingleton(OrderController);

  console.log(
    "✅ Order module registered (with normalized OrderShippingInfo table)"
  );
}