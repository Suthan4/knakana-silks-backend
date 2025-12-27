import { Response,Request, NextFunction } from "express";
import { UserRole } from "../../generated/prisma/client.js";
import { ResponseUtil } from "../utils/index.js";

/**
 * Middleware to authorize based on user roles
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      ResponseUtil.unauthorized(res, "Authentication required");
      return;
    }

    const userRole = req.user.role as UserRole;

    if (!allowedRoles.includes(userRole)) {
      ResponseUtil.forbidden(
        res,
        "You do not have permission to access this resource"
      );
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is admin (ADMIN or SUPER_ADMIN)
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    ResponseUtil.unauthorized(res, "Authentication required");
    return;
  }

  const userRole = req.user.role as UserRole;

  if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN) {
    ResponseUtil.forbidden(res, "Admin access required");
    return;
  }

  next();
};

/**
 * Middleware to check if user is super admin
 */
export const isSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    ResponseUtil.unauthorized(res, "Authentication required");
    return;
  }

  const userRole = req.user.role as UserRole;

  if (userRole !== UserRole.SUPER_ADMIN) {
    ResponseUtil.forbidden(res, "Super admin access required");
    return;
  }

  next();
};

/**
 * Middleware to check if user is accessing their own resource
 */
export const isOwner = (userIdParam: string = "id") => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      ResponseUtil.unauthorized(res, "Authentication required");
      return;
    }

    const resourceUserId = req.params[userIdParam] || req.body.userId;

    if (req.user.userId !== resourceUserId) {
      // Allow admins to access any resource
      const userRole = req.user.role as UserRole;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN) {
        ResponseUtil.forbidden(res, "You can only access your own resources");
        return;
      }
    }

    next();
  };
};

/**
 * Middleware to check if user is owner OR admin
 */
export const isOwnerOrAdmin = (userIdParam: string = "id") => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      ResponseUtil.unauthorized(res, "Authentication required");
      return;
    }

    const resourceUserId = req.params[userIdParam] || req.body.userId;
    const userRole = req.user.role as UserRole;

    const isResourceOwner = req.user.userId === resourceUserId;
    const isAdminRole =
      userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

    if (!isResourceOwner && !isAdminRole) {
      ResponseUtil.forbidden(res, "Access denied");
      return;
    }

    next();
  };
};
