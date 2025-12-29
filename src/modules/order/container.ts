import "reflect-metadata";
import { container } from "tsyringe";
import { IOrderRepository } from "./infrastructure/interface/Iorderrepository.js";
import { OrderService } from "./application/service/order.service.js";
import { OrderController } from "./presentation/controller/order.controller.js";
import { OrderRepository } from "./infrastructure/repository/orderRepository.js";

export function registerOrderModule() {
  // Repositories
  container.register<IOrderRepository>("IOrderRepository", {
    useClass: OrderRepository,
  });

  // Services
  container.registerSingleton(OrderService);

  // Controllers
  container.registerSingleton(OrderController);

  console.log("✅ Order module registered");
}
