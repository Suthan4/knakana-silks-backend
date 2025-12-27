import { UserRole } from "@/generated/prisma/enums.js";
import { AdminService } from "@/modules/auth/application/services/admin.service.js";
import { AuthService } from "@/modules/auth/application/services/auth.service.js";
import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";


declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

// Authenticate user
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const token = authHeader.substring(7);
    const authService = container.resolve(AuthService);
    const payload = authService.verifyAccessToken(token);

    req.user = payload;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

// Authorize roles
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Insufficient permissions" });
    }

    next();
  };
};

// Check module permission
export const checkPermission = (
  module: string,
  action: "create" | "read" | "update" | "delete"
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // Super admin has all permissions
    if (req.user.role === UserRole.SUPER_ADMIN) {
      return next();
    }

    const adminService = container.resolve(AdminService);
    const hasPermission = await adminService.hasPermission(
      BigInt(req.user.userId),
      module,
      action
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `You don't have permission to ${action} ${module}`,
      });
    }

    next();
  };
};
