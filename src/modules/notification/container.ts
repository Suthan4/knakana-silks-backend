import "reflect-metadata";
import { container } from "tsyringe";
import { EmailService } from "./application/service/email.service.js";

export function registerEmailModule() {
  // Services
  container.registerSingleton(EmailService);

  console.log("✅ Email module registered");
}
