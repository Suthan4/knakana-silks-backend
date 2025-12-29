import "reflect-metadata";
import { container } from "tsyringe";
import { IConsultationRepository } from "./infrastructure/interface/Iconsultationrepository.js";
import { ConsultationRepository } from "./infrastructure/repository/consultationRepository.js";
import { ConsultationService } from "./application/service/consultation.service.js";
import { ConsultationController } from "./presentation/controller/consultation.controller.js";

export function registerConsultationModule() {
  // Repositories
  container.register<IConsultationRepository>("IConsultationRepository", {
    useClass: ConsultationRepository,
  });

  // Services
  container.registerSingleton(ConsultationService);

  // Controllers
  container.registerSingleton(ConsultationController);

  console.log("✅ Consultation module registered");
}
