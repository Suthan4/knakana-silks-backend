import "reflect-metadata";
import { container } from "tsyringe";
import { SearchService } from "./application/service/search.service.js";
import { SearchController } from "./presentation/controller/search.controller.js";

export function registerSearchModule() {
  // Services
  container.registerSingleton(SearchService);

  // Controllers
  container.registerSingleton(SearchController);

  console.log("✅ Search module registered");
}