import { Router } from "express";
import { container } from "tsyringe";
import { AuthController } from "./auth.controller.js";
import { AdminController } from "./admin.controller.js";
import {
  authenticate,
  authorize,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { UserRole } from "@/generated/prisma/enums.js";
import z from "zod";
import { sendNewsletterSubscriptionEmail } from "../application/services/email.service.js";

const router = Router();
const subscribeSchema = z.object({
  email: z.string().email("Invalid email"),
});

// Helper function to resolve controller lazily
const getAuthController = () => container.resolve(AuthController);
const getAdminController = () => container.resolve(AdminController);

// ============ Auth Routes ============
router.post("/auth/register", (req, res) =>
  getAuthController().register(req, res)
);
router.post("/auth/login", (req, res) => getAuthController().login(req, res));
router.post("/auth/refresh-token", (req, res) =>
  getAuthController().refreshToken(req, res)
);
router.post("/auth/forgot-password", (req, res) =>
  getAuthController().forgotPassword(req, res)
);
router.post("/auth/reset-password", (req, res) =>
  getAuthController().resetPassword(req, res)
);

router.post("/auth/logout", authenticate, (req, res) =>
  getAuthController().logout(req, res)
);
router.post("/auth/revoke-token", authenticate, (req, res) =>
  getAuthController().revokeToken(req, res)
);
router.get("/auth/me", authenticate, (req, res) =>
  getAuthController().getProfile(req, res)
);

router.put("/auth/profile", authenticate, (req, res) =>
  getAuthController().updateProfile(req, res)
);
router.put("/auth/change-password", authenticate, (req, res) =>
  getAuthController().changePassword(req, res)
);
router.post("/auth/newsletter/subscribe", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }
    await sendNewsletterSubscriptionEmail(email);
    res.json({ success: true, message: "Subscribed successfully!" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ Admin Routes ============
router.post(
  "/admin/create-admin",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  (req, res) => getAdminController().createAdmin(req, res)
);

router.post(
  "/admin/set-permissions",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  (req, res) => getAdminController().setPermissions(req, res)
);

router.get(
  "/admin/users",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  (req, res) => getAdminController().listUsers(req, res)
);

router.get(
  "/admin/permissions/:userId",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  (req, res) => getAdminController().getUserPermissions(req, res)
);

router.put(
  "/admin/users/:userId/role",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  (req, res) => getAdminController().updateUserRole(req, res)
);

router.put(
  "/admin/users/:userId/toggle-status",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  (req, res) => getAdminController().toggleUserStatus(req, res)
);


export default router;
