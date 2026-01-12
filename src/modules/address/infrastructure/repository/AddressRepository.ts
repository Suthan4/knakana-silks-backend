import { inject, injectable } from "tsyringe";
import {
  Address,
  AddressType,
  PrismaClient,
} from "@/generated/prisma/client.js";
import { IAddressRepository } from "../interface/Iaddressrepository.js";

@injectable()
export class AddressRepository implements IAddressRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<Address | null> {
    return this.prisma.address.findUnique({ where: { id } });
  }

  async findByUserId(userId: bigint): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findByUserIdAndType(
    userId: bigint,
    type: AddressType
  ): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: {
        userId,
        OR: [{ type: type }, { type: AddressType.BOTH }],
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findShippingAddresses(userId: bigint): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: {
        userId,
        OR: [{ type: AddressType.SHIPPING }, { type: AddressType.BOTH }],
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findBillingAddresses(userId: bigint): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: {
        userId,
        OR: [{ type: AddressType.BILLING }, { type: AddressType.BOTH }],
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(data: {
    userId: bigint;
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    type: AddressType;
    isDefault: boolean;
  }): Promise<Address> {
    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId: data.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({ data });
  }

  async update(id: bigint, data: Partial<Address>): Promise<Address> {
    // If setting as default, unset other defaults
    if (data.isDefault) {
      const address = await this.findById(id);
      if (address) {
        await this.prisma.address.updateMany({
          where: { userId: address.userId, isDefault: true },
          data: { isDefault: false },
        });
      }
    }

    return this.prisma.address.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.address.delete({ where: { id } });
  }

  async setAsDefault(id: bigint, userId: bigint): Promise<Address> {
    // Unset all defaults for this user
    await this.prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this address as default
    return this.prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async getDefault(userId: bigint): Promise<Address | null> {
    return this.prisma.address.findFirst({
      where: { userId, isDefault: true },
    });
  }
}
