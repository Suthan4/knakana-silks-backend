import { injectable, inject } from "tsyringe";
import bcrypt from "bcrypt";
import { IUserRepository } from "../../interface/Iuserrepository.js";
import { IPermissionRepository } from "../../interface/Ipermissionrepository.js";
import { UserRole } from "@/generated/prisma/enums.js";


@injectable()
export class AdminService {
  constructor(
    @inject("IUserRepository") private userRepository: IUserRepository,
    @inject("IPermissionRepository")
    private permissionRepository: IPermissionRepository
  ) {}

  // Create Admin (only SUPER_ADMIN can do this)
  async createAdmin(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string
  ) {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) throw new Error("User already exists");

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role: UserRole.ADMIN,
    });

    const { password: _, ...adminWithoutPassword } = admin;
    return adminWithoutPassword;
  }

  // Set module permissions for user
  async setPermissions(
    userId: bigint,
    module: string,
    permissions: {
      canCreate?: boolean;
      canRead?: boolean;
      canUpdate?: boolean;
      canDelete?: boolean;
    }
  ) {
    const permission = await this.permissionRepository.upsert({
      userId,
      module,
      canCreate: permissions.canCreate ?? false,
      canRead: permissions.canRead ?? true,
      canUpdate: permissions.canUpdate ?? false,
      canDelete: permissions.canDelete ?? false,
    });

    return permission;
  }

  // Get user permissions
  async getUserPermissions(userId: bigint) {
    const permissions = await this.permissionRepository.findByUserId(userId);

    return permissions.map((p) => ({
      module: p.module,
      canCreate: p.canCreate,
      canRead: p.canRead,
      canUpdate: p.canUpdate,
      canDelete: p.canDelete,
    }));
  }

  // Check if user has permission
  async hasPermission(
    userId: bigint,
    module: string,
    action: "create" | "read" | "update" | "delete"
  ) {
    console.log("🔍 Checking permission:", { userId, module, action }); // Add this
    const permission = await this.permissionRepository.findByUserIdAndModule(
      userId,
      module
    );

    if (!permission) return false;

    switch (action) {
      case "create":
        return permission.canCreate;
      case "read":
        return permission.canRead;
      case "update":
        return permission.canUpdate;
      case "delete":
        return permission.canDelete;
      default:
        return false;
    }
  }

  // Update user role
  async updateUserRole(userId: bigint, role: UserRole) {
    const user = await this.userRepository.update(userId, { role });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // List all users (admin/super-admin)
  async listUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userRepository.findAll(skip, limit),
      this.userRepository.count(),
    ]);

    const usersWithoutPassword = users.map(({ password, ...user }) => user);

    return {
      users: usersWithoutPassword,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Deactivate/Activate user
  async toggleUserStatus(userId: bigint) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    const updatedUser = await this.userRepository.update(userId, {
      isActive: !user.isActive,
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }
}
