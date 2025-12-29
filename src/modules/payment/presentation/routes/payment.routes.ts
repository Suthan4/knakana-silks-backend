import { Router } from "express";
import { container } from "tsyringe";
import { PaymentWebhookController } from "../controller/payment.webhook.controller.js";
import express from "express";

const router = Router();

const getPaymentWebhookController = () =>
  container.resolve(PaymentWebhookController);

// Webhook route - no authentication needed but signature verified
router.post(
  "/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  (req, res) => getPaymentWebhookController().handleWebhook(req, res)
);

export default router;
