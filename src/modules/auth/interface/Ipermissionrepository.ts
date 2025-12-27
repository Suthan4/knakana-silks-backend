import { Permission } from "../../../generated/prisma/client.js";

export interface IPermissionRepository {
  upsert(data: {
    userId: bigint;
    module: string;
    canCreate: boolean;
    canRead: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }): Promise<Permission>;
  findByUserId(userId: bigint): Promise<Permission[]>;
  findByUserIdAndModule(
    userId: bigint,
    module: string
  ): Promise<Permission | null>;
}
