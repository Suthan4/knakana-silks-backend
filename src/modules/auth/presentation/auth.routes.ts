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

const router = Router();

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

// ============ Admin Routes ============
router.post(
  "/admin/create-admin",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  (req, res) => getAdminController().createAdmin(req, res)
);

router.post(
  "/admin/permissions",
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

// ============ Example: Module Permission Routes ============
router.post(
  "/products",
  authenticate,
  checkPermission("products", "create"),
  (req, res) => {
    res.json({ message: "Create product - permission granted" });
  }
);

router.get(
  "/products",
  authenticate,
  checkPermission("products", "read"),
  (req, res) => {
    res.json({ message: "Read products - permission granted" });
  }
);

router.put(
  "/products/:id",
  authenticate,
  checkPermission("products", "update"),
  (req, res) => {
    res.json({ message: "Update product - permission granted" });
  }
);

router.delete(
  "/products/:id",
  authenticate,
  checkPermission("products", "delete"),
  (req, res) => {
    res.json({ message: "Delete product - permission granted" });
  }
);

export default router;
