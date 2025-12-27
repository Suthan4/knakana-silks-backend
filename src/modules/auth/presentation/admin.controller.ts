import { Response,Request } from "express";
import { injectable } from "tsyringe";
import { z } from "zod";
import { AdminService } from "../application/services/admin.service.js";
import { UserRole } from "@/generated/prisma/enums.js";

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

const setPermissionSchema = z.object({
  userId: z.string(),
  module: z.string(),
  canCreate: z.boolean().optional(),
  canRead: z.boolean().optional(),
  canUpdate: z.boolean().optional(),
  canDelete: z.boolean().optional(),
});

@injectable()
export class AdminController {
  constructor(private adminService: AdminService) {}

  async createAdmin(req: Request, res: Response) {
    try {
      const data = createAdminSchema.parse(req.body);
      const admin = await this.adminService.createAdmin(
        data.email,
        data.password,
        data.firstName,
        data.lastName,
        data.phone
      );

      res.status(201).json({
        success: true,
        message: "Admin created successfully",
        data: admin,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async setPermissions(req: Request, res: Response) {
    try {
      const data = setPermissionSchema.parse(req.body);
      const permission = await this.adminService.setPermissions(
        BigInt(data.userId),
        data.module,
        {
          canCreate: data.canCreate,
          canRead: data.canRead,
          canUpdate: data.canUpdate,
          canDelete: data.canDelete,
        }
      );

      res.json({
        success: true,
        message: "Permissions updated successfully",
        data: permission,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getUserPermissions(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "User ID is required" });
      }
      
      const permissions = await this.adminService.getUserPermissions(
        BigInt(userId)
      );

      res.json({
        success: true,
        data: permissions,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateUserRole(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!Object.values(UserRole).includes(role)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid role" });
      }
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "User ID is required" });
      }
      const user = await this.adminService.updateUserRole(BigInt(userId), role);

      res.json({
        success: true,
        message: "User role updated successfully",
        data: user,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async listUsers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.adminService.listUsers(page, limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async toggleUserStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;
            if (!userId) {
              return res
                .status(400)
                .json({ success: false, message: "User ID is required" });
            }
      const user = await this.adminService.toggleUserStatus(BigInt(userId));

      res.json({
        success: true,
        message: `User ${
          user.isActive ? "activated" : "deactivated"
        } successfully`,
        data: user,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
