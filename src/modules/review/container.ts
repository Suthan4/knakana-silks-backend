import "reflect-metadata";
import { container } from "tsyringe";
import { IReviewRepository } from "./infrastructure/interface/Ireviewrepository.js";
import { ReviewService } from "./application/service/review.service.js";
import { ReviewController } from "./presentation/controller/review.controller.js";
import { ReviewRepository } from "./infrastructure/repository/review.repository.js";

export function registerReviewModule() {
  // Repositories
  container.register<IReviewRepository>("IReviewRepository", {
    useClass: ReviewRepository,
  });

  // Services
  container.registerSingleton(ReviewService);

  // Controllers
  container.registerSingleton(ReviewController);

  console.log("✅ Review module registered");
}
