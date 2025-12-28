import { injectable, inject } from "tsyringe";
import { IAddressRepository } from "../../infrastructure/interface/Iaddressrepository.js";

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
      type?: string;
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
      type: data.type || "SHIPPING",
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
      type?: string;
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

    return this.addressRepository.update(BigInt(addressId), data);
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
}
