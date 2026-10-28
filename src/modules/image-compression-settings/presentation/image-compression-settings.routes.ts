import { Router, type Request, type Response } from "express";
import { authenticate, authorize } from "@/shared/middleware/auth.middleware.js";
import { UserRole } from "@/generated/prisma/enums.js";
import { getPrismaClient } from "@/lib/database/prisma.js";

const router = Router();
const prisma = getPrismaClient();

const DEFAULTS = [
  { uploadType: "product", imgCompressionEnabled: true, imgQuality: 70 },
  { uploadType: "category", imgCompressionEnabled: true, imgQuality: 85 },
  { uploadType: "banner", imgCompressionEnabled: true, imgQuality: 85 },
  { uploadType: "bulk", imgCompressionEnabled: true, imgQuality: 70 },
] as const;

const allowedTypes = new Set(DEFAULTS.map((setting) => setting.uploadType));

async function ensureDefaults() {
  // One idempotent database round-trip instead of four sequential upserts on
  // every settings read/save. Existing administrator choices are never overwritten.
  await prisma.imageCompressionSetting.createMany({
    data: [...DEFAULTS],
    skipDuplicates: true,
  });
}

router.get(
  "/admin/image-compression-settings",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  async (_req: Request, res: Response) => {
    try {
      await ensureDefaults();
      const settings = await prisma.imageCompressionSetting.findMany({
        orderBy: { uploadType: "asc" },
      });
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      console.error("Unable to load image compression settings", error);
      res.status(500).json({ success: false, message: "Unable to load image compression settings." });
    }
  },
);

router.put(
  "/admin/image-compression-settings/:uploadType",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const uploadType = String(req.params.uploadType);
    const { imgCompressionEnabled, imgQuality } = req.body ?? {};

    if (!allowedTypes.has(uploadType as (typeof DEFAULTS)[number]["uploadType"])) {
      res.status(400).json({ success: false, message: "Unsupported upload type." });
      return;
    }
    if (typeof imgCompressionEnabled !== "boolean") {
      res.status(400).json({ success: false, message: "imgCompressionEnabled must be a boolean." });
      return;
    }
    if (!Number.isInteger(imgQuality) || imgQuality < 1 || imgQuality > 100) {
      res.status(400).json({ success: false, message: "imgQuality must be an integer between 1 and 100." });
      return;
    }

    try {
      await ensureDefaults();
      const setting = await prisma.imageCompressionSetting.upsert({
        where: { uploadType },
        create: { uploadType, imgCompressionEnabled, imgQuality },
        update: { imgCompressionEnabled, imgQuality },
      });
      res.status(200).json({ success: true, data: setting });
    } catch (error) {
      console.error("Unable to update image compression settings", error);
      res.status(500).json({ success: false, message: "Unable to save image compression settings." });
    }
  },
);

export default router;
