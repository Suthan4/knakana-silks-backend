import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { AddressService } from "../../application/service/address.service.js";
import { CreateAddressDTOSchema, UpdateAddressDTOSchema } from "../../application/dtos/address.dto.js";


@injectable()
export class AddressController {
  constructor(@inject(AddressService) private addressService: AddressService) {}

  async createAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = CreateAddressDTOSchema.parse(req.body);

      const address = await this.addressService.createAddress(userId, data);

      res.status(201).json({
        success: true,
        message: "Address created successfully",
        data: address,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const data = UpdateAddressDTOSchema.parse(req.body);

       if (!id || Array.isArray(id)) {
         res
           .status(400)
           .json({ success: false, message: "ID is required" });
         return;
       }

      const address = await this.addressService.updateAddress(userId, id, data);

      res.json({
        success: true,
        message: "Address updated successfully",
        data: address,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

       if (!id ||  Array.isArray(id)) {
         res
           .status(400)
           .json({ success: false, message: "Id is required" });
         return;
       }

      await this.addressService.deleteAddress(userId, id);

      res.json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

       if (!id ||  Array.isArray(id)) {
         res
           .status(400)
           .json({ success: false, message: "ID is required" });
         return;
       }

      const address = await this.addressService.getAddress(userId, id);

      res.json({
        success: true,
        data: address,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getAddresses(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const addresses = await this.addressService.getAddresses(userId);

      res.json({
        success: true,
        data: addresses,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async setAsDefault(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

       if (!id ||  Array.isArray(id)) {
         res
           .status(400)
           .json({ success: false, message: "ID is required" });
         return;
       }

      const address = await this.addressService.setAsDefault(userId, id);

      res.json({
        success: true,
        message: "Default address set successfully",
        data: address,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getDefaultAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const address = await this.addressService.getDefaultAddress(userId);

      res.json({
        success: true,
        data: address,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
}
