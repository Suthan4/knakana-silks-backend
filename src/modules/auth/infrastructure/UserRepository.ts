import { inject, injectable } from "tsyringe";
import { UserRole } from "../../../generated/prisma/enums.js";
import { PrismaClient, User } from "../../../generated/prisma/client.js";
import { IUserRepository } from "../interface/Iuserrepository.js";


@injectable()
export class UserRepository implements IUserRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: bigint, data: Partial<User>): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async findAll(skip: number, take: number): Promise<User[]> {
    return this.prisma.user.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }
}
