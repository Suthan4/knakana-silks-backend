import "reflect-metadata";
import { container } from "tsyringe";
import { IUserRepository } from "./interface/Iuserrepository.js";
import { UserRepository } from "./infrastructure/UserRepository.js";
import { IRefreshTokenRepository } from "./interface/Irefreshtokenrepository.js";
import { RefreshTokenRepository } from "./infrastructure/Refreshtokenrepository.js";
import { PermissionRepository } from "./infrastructure/Permissionrepository.js";
import { IPermissionRepository } from "./interface/Ipermissionrepository.js";
import { AuthService } from "./application/services/auth.service.js";
import { AdminService } from "./application/services/admin.service.js";
import { AuthController } from "./presentation/auth.controller.js";
import { AdminController } from "./presentation/admin.controller.js";

// Auth Module


// Function to register Auth module
export function registerAuthModule() {
  // Repositories
  container.register<IUserRepository>("IUserRepository", {
    useClass: UserRepository,
  });

  container.register<IRefreshTokenRepository>("IRefreshTokenRepository", {
    useClass: RefreshTokenRepository,
  });

  container.register<IPermissionRepository>("IPermissionRepository", {
    useClass: PermissionRepository,
  });

  // Services
  container.registerSingleton(AuthService);
  container.registerSingleton(AdminService);

  // Controllers
  container.registerSingleton(AuthController);
  container.registerSingleton(AdminController);

  console.log("✅ Auth module registered");
}
