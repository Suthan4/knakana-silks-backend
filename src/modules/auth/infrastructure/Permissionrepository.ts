import { inject, injectable } from "tsyringe";
import { IPermissionRepository } from "../interface/Ipermissionrepository.js";
import { Permission, PrismaClient } from "../../../generated/prisma/client.js";


@injectable()
export class PermissionRepository implements IPermissionRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async upsert(data: {
    userId: bigint;
    module: string;
    canCreate: boolean;
    canRead: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }): Promise<Permission> {
    return this.prisma.permission.upsert({
      where: {
        userId_module: {
          userId: data.userId,
          module: data.module,
        },
      },
      update: {
        canCreate: data.canCreate,
        canRead: data.canRead,
        canUpdate: data.canUpdate,
        canDelete: data.canDelete,
      },
      create: data,
    });
  }

  async findByUserId(userId: bigint): Promise<Permission[]> {
    return this.prisma.permission.findMany({ where: { userId } });
  }

  async findByUserIdAndModule(
    userId: bigint,
    module: string
  ): Promise<Permission | null> {
    return this.prisma.permission.findUnique({
      where: { userId_module: { userId, module } },
    });
  }
}
