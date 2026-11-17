import { Router } from "express";
import { AnalyticsController } from "../controller/analytics.controller.js";
import { authenticate, checkPermission } from "@/shared/middleware/auth.middleware.js";

const router = Router();
const controller = new AnalyticsController();

router.get("/admin/analytics/report", authenticate, checkPermission("orders", "read"), (req, res) => controller.getReport(req, res));
router.get("/admin/analytics/export", authenticate, checkPermission("orders", "read"), (req, res) => controller.exportReport(req, res));

export default router;
