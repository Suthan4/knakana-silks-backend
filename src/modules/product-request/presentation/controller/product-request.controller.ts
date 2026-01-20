import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ProductRequestService } from "../../application/service/product-request.service.js";
import {
  CreateProductRequestDTOSchema,
  UpdateProductRequestDTOSchema,
  QueryProductRequestDTOSchema,
} from "../../application/dtos/product-request.dto.js";

@injectable()
export class ProductRequestController {
  constructor(
    @inject(ProductRequestService)
    private productRequestService: ProductRequestService
  ) {}

  async createRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = CreateProductRequestDTOSchema.parse(req.body);

      const request = await this.productRequestService.createProductRequest(
        userId,
        data
      );

      res.status(201).json({
        success: true,
        message: "Product request created successfully",
        data: request,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getUserRequests(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const params = QueryProductRequestDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.productRequestService.getUserRequests(
        userId,
        params
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Request ID is required" });
      }

      const request = await this.productRequestService.getRequest(userId, id);

      res.json({
        success: true,
        data: request,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async cancelRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Request ID is required" });
      }

      const request = await this.productRequestService.cancelRequest(
        userId,
        id
      );

      res.json({
        success: true,
        message: "Request cancelled successfully",
        data: request,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Admin endpoints
  async getAllRequests(req: Request, res: Response) {
    try {
      const params = QueryProductRequestDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.productRequestService.getAllRequests(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async approveRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = UpdateProductRequestDTOSchema.parse(req.body);

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Request ID is required" });
      }

      const request = await this.productRequestService.approveRequest(id, {
        adminNote: data.adminNote,
        estimatedAvailability: data.estimatedAvailability,
      });

      res.json({
        success: true,
        message: "Request approved successfully",
        data: request,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async rejectRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Request ID is required" });
      }

      if (!adminNote) {
        return res
          .status(400)
          .json({ success: false, message: "Admin note is required" });
      }

      const request = await this.productRequestService.rejectRequest(
        id,
        adminNote
      );

      res.json({
        success: true,
        message: "Request rejected successfully",
        data: request,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async fulfillRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { orderId } = req.body;

      if (!id || !orderId) {
        return res.status(400).json({
          success: false,
          message: "Request ID and Order ID are required",
        });
      }

      const request = await this.productRequestService.fulfillRequest(
        id,
        orderId
      );

      res.json({
        success: true,
        message: "Request fulfilled successfully",
        data: request,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}