import "reflect-metadata";
import { container } from "tsyringe";
import { IPaymentRepository } from "./infrastructure/interface/Ipaymentrepository.js";
import { PaymentWebhookController } from "./presentation/controller/payment.webhook.controller.js";
import { PaymentRepository } from "./infrastructure/repository/paymentRepository.js";
import { RazorpayService } from "./application/service/razorpay.service.js";

export function registerPaymentModule() {
  // Repositories
  container.register<IPaymentRepository>("IPaymentRepository", {
    useClass: PaymentRepository,
  });

  // Services
  container.registerSingleton(RazorpayService);

  // Controllers
  container.registerSingleton(PaymentWebhookController);

  console.log("✅ Payment module registered");
}
