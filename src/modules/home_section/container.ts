import "reflect-metadata";
import { container } from "tsyringe";
import { IHomeSectionRepository } from "./infrastructure/interface/Ihomesectionrepository.js";
import { HomeSectionRepository } from "./infrastructure/repository/homeRepository.js";
import { HomeSectionService } from "./application/service/home_section.service.js";
import { HomeSectionController } from "./presentation/controller/home_section.controller.js";


export function registerHomeSectionModule() {
  // Repositories
  container.register<IHomeSectionRepository>("IHomeSectionRepository", {
    useClass: HomeSectionRepository,
  });

  // Services
  container.registerSingleton(HomeSectionService);

  // Controllers
  container.registerSingleton(HomeSectionController);

  console.log("✅ HomeSection module registered");
}
