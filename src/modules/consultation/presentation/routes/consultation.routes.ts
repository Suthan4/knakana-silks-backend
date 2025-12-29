import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { ConsultationController } from "../controller/consultation.controller.js";

const router = Router();

const getConsultationController = () =>
  container.resolve(ConsultationController);

// User routes (authenticated)
router.post("/consultations", authenticate, (req, res) =>
  getConsultationController().createConsultation(req, res)
);

router.get("/consultations/my-consultations", authenticate, (req, res) =>
  getConsultationController().getUserConsultations(req, res)
);

router.get("/consultations/:id", authenticate, (req, res) =>
  getConsultationController().getConsultation(req, res)
);

router.post("/consultations/:id/cancel", authenticate, (req, res) =>
  getConsultationController().cancelConsultation(req, res)
);

// Admin routes
router.get(
  "/admin/consultations",
  authenticate,
  checkPermission("consultations", "read"),
  (req, res) => getConsultationController().getAllConsultations(req, res)
);

router.get(
  "/admin/consultations/:id",
  authenticate,
  checkPermission("consultations", "read"),
  (req, res) => getConsultationController().getAdminConsultation(req, res)
);

router.put(
  "/admin/consultations/:id/status",
  authenticate,
  checkPermission("consultations", "update"),
  (req, res) => getConsultationController().updateConsultationStatus(req, res)
);

export default router;
