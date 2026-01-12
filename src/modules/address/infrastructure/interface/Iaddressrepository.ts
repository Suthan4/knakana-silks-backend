import { Address, AddressType } from "@/generated/prisma/client.js";

export interface IAddressRepository {
  findById(id: bigint): Promise<Address | null>;
  findByUserId(userId: bigint): Promise<Address[]>;
  findByUserIdAndType(userId: bigint, type: AddressType): Promise<Address[]>;
  findShippingAddresses(userId: bigint): Promise<Address[]>;
  findBillingAddresses(userId: bigint): Promise<Address[]>;
  create(data: {
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
  }): Promise<Address>;
  update(id: bigint, data: Partial<Address>): Promise<Address>;
  delete(id: bigint): Promise<void>;
  setAsDefault(id: bigint, userId: bigint): Promise<Address>;
  getDefault(userId: bigint): Promise<Address | null>;
}
