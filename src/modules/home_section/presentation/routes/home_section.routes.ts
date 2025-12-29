import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { HomeSectionController } from "../controller/home_section.controller.js";

const router = Router();

const getHomeSectionController = () => container.resolve(HomeSectionController);

// Public routes
router.get("/home-sections/active", (req, res) =>
  getHomeSectionController().getActiveSections(req, res)
);

router.get("/home-sections", (req, res) =>
  getHomeSectionController().getHomeSections(req, res)
);

router.get("/home-sections/:id", (req, res) =>
  getHomeSectionController().getHomeSection(req, res)
);

// Admin routes
router.post(
  "/home-sections",
  authenticate,
  checkPermission("home-sections", "create"),
  (req, res) => getHomeSectionController().createHomeSection(req, res)
);

router.put(
  "/home-sections/:id",
  authenticate,
  checkPermission("home-sections", "update"),
  (req, res) => getHomeSectionController().updateHomeSection(req, res)
);

router.delete(
  "/home-sections/:id",
  authenticate,
  checkPermission("home-sections", "delete"),
  (req, res) => getHomeSectionController().deleteHomeSection(req, res)
);

export default router;
