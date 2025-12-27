import { User, UserRole } from "../../../generated/prisma/client.js";

export interface IUserRepository {
  findById(id: bigint): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: UserRole;
  }): Promise<User>;
  update(id: bigint, data: Partial<User>): Promise<User>;
  findAll(skip: number, take: number): Promise<User[]>;
  count(): Promise<number>;
}