import { RefreshToken } from "../../../generated/prisma/client.js";

export interface IRefreshTokenRepository {
  create(userId: bigint, token: string, expiresAt: Date): Promise<RefreshToken>;
  findByToken(token: string): Promise<RefreshToken | null>;
  deleteByToken(token: string): Promise<void>;
  deleteByUserId(userId: bigint): Promise<void>;
}
