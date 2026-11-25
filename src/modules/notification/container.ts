import "reflect-metadata";
import { container } from "tsyringe";
import { EmailService } from "./application/service/email.service.js";
import { EmailJobWorker } from "./application/service/email-job.worker.js";

export function registerEmailModule() {
  // Services
  container.registerSingleton(EmailService);
  container.registerSingleton(EmailJobWorker);

  console.log("✅ Email module registered");
}
