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
import { getPrismaClient } from "@/lib/database/prisma.js";
import { Msg91OtpService } from "../application/services/msg91-otp.service.js";
import { AuthService } from "../application/services/auth.service.js";
import { rateLimit } from "express-rate-limit";

const router = Router();
const subscribeSchema = z.object({
  email: z.string().email("Invalid email"),
});

// Helper function to resolve controller lazily
const getAuthController = () => container.resolve(AuthController);
const getAdminController = () => container.resolve(AdminController);

// ============ Customer mobile OTP routes (MSG91) ============
const msg91Otp = new Msg91OtpService();
const mobileOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: "OTP_RATE_LIMITED", message: "Too many OTP attempts. Please wait 10 minutes." },
});
const mobileSchema = z.object({ mobile: z.string().min(10).max(16) });

router.post("/auth/mobile/send-otp", mobileOtpLimiter, async (req, res) => {
  try {
    const { mobile } = mobileSchema.parse(req.body);
    const sent = await msg91Otp.send(mobile);
    res.json({ success: true, message: "OTP sent successfully.", data: { mobile: sent.mobile } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || "Unable to send OTP." });
  }
});

router.post("/auth/mobile/resend-otp", mobileOtpLimiter, async (req, res) => {
  try {
    const { mobile } = mobileSchema.parse(req.body);
    await msg91Otp.resend(mobile);
    res.json({ success: true, message: "A new OTP has been sent." });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || "Unable to resend OTP." });
  }
});

router.post("/auth/mobile/verify-otp", mobileOtpLimiter, async (req, res) => {
  try {
    const data = z.object({ mobile: z.string().min(10).max(16), otp: z.string().length(6) }).parse(req.body);
    const verified = await msg91Otp.verify(data.mobile, data.otp);
    const digits = verified.mobile.slice(2);
    const prisma = getPrismaClient();
    const user = await prisma.user.findFirst({
      where: {
        phone: { in: [digits, verified.mobile, `+${verified.mobile}`] },
        role: UserRole.USER,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "CUSTOMER_ACCOUNT_NOT_FOUND",
        message: "Your number is verified. Please create your customer account to continue.",
      });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "This account is currently unavailable." });
    }

    const authService = container.resolve(AuthService);
    const tokens = authService.generateTokens({
      userId: user.id.toString(),
      email: user.email,
      role: user.role,
    });
    await authService.saveRefreshToken(user.id, tokens.refreshToken);

    res.json({
      success: true,
      message: "Mobile number verified. You are signed in.",
      data: {
        user: {
          id: user.id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || "OTP verification failed." });
  }
});

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

// ============ Google Drive OAuth Routes ============

// Drive connection status — tells the frontend whether Drive is connected
router.get(
  "/auth/drive/status",
  authenticate,
  (req, res) => getAuthController().getDriveStatus(req, res)
);

router.get(
  "/auth/google",
  (req, res, next) => {
    // If auth credentials present (Bearer token, cookie, or token query), authenticate
    if (
      req.headers.authorization ||
      req.query.token ||
      (req as any).cookies?.accessToken
    ) {
      return authenticate(req, res, next);
    }
    next();
  },
  (req, res) => getAuthController().redirectToGoogle(req, res)
);

router.get("/auth/google/callback", (req, res) =>
  getAuthController().handleGoogleCallback(req, res)
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
