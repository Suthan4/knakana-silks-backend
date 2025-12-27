import { inject, injectable } from "tsyringe";
import { PrismaClient, RefreshToken } from "../../../generated/prisma/client.js";
import { IRefreshTokenRepository } from "../interface/Irefreshtokenrepository.js";

@injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async create(
    userId: bigint,
    token: string,
    expiresAt: Date
  ): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { token } });
  }

  async deleteByToken(token: string): Promise<void> {
    await this.prisma.refreshToken.delete({ where: { token } });
  }

  async deleteByUserId(userId: bigint): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
