import { injectable, inject } from "tsyringe";
import { IAddressRepository } from "../../infrastructure/interface/Iaddressrepository.js";
import { AddressType } from "@/generated/prisma/enums.js";

@injectable()
export class AddressService {
  constructor(
    @inject("IAddressRepository") private addressRepository: IAddressRepository
  ) {}

  async createAddress(
    userId: string,
    data: {
      fullName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      pincode: string;
      country?: string;
      type?: "SHIPPING" | "BILLING" | "BOTH";
      isDefault?: boolean;
    }
  ) {
    return this.addressRepository.create({
      userId: BigInt(userId),
      fullName: data.fullName,
      phone: data.phone,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      country: data.country || "India",
      type: (data.type || "SHIPPING") as AddressType,
      isDefault: data.isDefault ?? false,
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    data: {
      fullName?: string;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
      type?: "SHIPPING" | "BILLING" | "BOTH";
      isDefault?: boolean;
    }
  ) {
    const address = await this.addressRepository.findById(BigInt(addressId));

    if (!address) {
      throw new Error("Address not found");
    }

    // Verify address belongs to user
    if (address.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    // Convert type to AddressType enum if provided
    const updateData: any = { ...data };
    if (data.type) {
      updateData.type = data.type as AddressType;
    }

    return this.addressRepository.update(BigInt(addressId), updateData);
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.addressRepository.findById(BigInt(addressId));

    if (!address) {
      throw new Error("Address not found");
    }

    // Verify address belongs to user
    if (address.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    await this.addressRepository.delete(BigInt(addressId));
  }

  async getAddress(userId: string, addressId: string) {
    const address = await this.addressRepository.findById(BigInt(addressId));

    if (!address) {
      throw new Error("Address not found");
    }

    // Verify address belongs to user
    if (address.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return address;
  }

  async getAddresses(userId: string) {
    return this.addressRepository.findByUserId(BigInt(userId));
  }

  async setAsDefault(userId: string, addressId: string) {
    const address = await this.addressRepository.findById(BigInt(addressId));

    if (!address) {
      throw new Error("Address not found");
    }

    // Verify address belongs to user
    if (address.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return this.addressRepository.setAsDefault(
      BigInt(addressId),
      BigInt(userId)
    );
  }

  async getDefaultAddress(userId: string) {
    return this.addressRepository.getDefault(BigInt(userId));
  }

  /**
   * Get addresses by type (SHIPPING, BILLING, or BOTH)
   */
  async getAddressesByType(userId: string, type: AddressType) {
    return this.addressRepository.findByUserIdAndType(BigInt(userId), type);
  }

  /**
   * Get shipping addresses (type SHIPPING or BOTH)
   */
  async getShippingAddresses(userId: string) {
    return this.addressRepository.findShippingAddresses(BigInt(userId));
  }

  /**
   * Get billing addresses (type BILLING or BOTH)
   */
  async getBillingAddresses(userId: string) {
    return this.addressRepository.findBillingAddresses(BigInt(userId));
  }
}
