import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { BannerController } from "../controller/banner.controller.js";

const router = Router();

const getBannerController = () => container.resolve(BannerController);

// Public routes
router.get("/banners/active", (req, res) =>
  getBannerController().getActiveBanners(req, res)
);

router.get("/banners", (req, res) =>
  getBannerController().getBanners(req, res)
);

router.get("/banners/:id", (req, res) =>
  getBannerController().getBanner(req, res)
);

// Admin routes
router.post(
  "/banners",
  authenticate,
  checkPermission("banners", "create"),
  (req, res) => getBannerController().createBanner(req, res)
);

router.put(
  "/banners/:id",
  authenticate,
  checkPermission("banners", "update"),
  (req, res) => getBannerController().updateBanner(req, res)
);

router.delete(
  "/banners/:id",
  authenticate,
  checkPermission("banners", "delete"),
  (req, res) => getBannerController().deleteBanner(req, res)
);

export default router;
