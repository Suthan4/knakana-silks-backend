import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ReturnService } from "../../application/service/return.service.js";
import {
  CreateReturnDTOSchema,
  UpdateReturnStatusDTOSchema,
  QueryReturnDTOSchema,
  ScheduleReturnPickupDTOSchema,
} from "../../application/dtos/return.dtos.js";

@injectable()
export class ReturnController {
  constructor(@inject(ReturnService) private returnService: ReturnService) {}

  /**
   * Create return request (User)
   */
  async createReturn(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = CreateReturnDTOSchema.parse(req.body);

      const returnRequest = await this.returnService.createReturn(userId, data);

      res.status(201).json({
        success: true,
        message: "Return request created successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get user returns (User)
   */
  async getUserReturns(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const params = QueryReturnDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.returnService.getUserReturns(userId, params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get return by ID (User)
   */
  async getReturn(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      const returnRequest = await this.returnService.getReturn(userId, id);

      res.json({
        success: true,
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Track return shipment (User)
   */
  async trackReturnShipment(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      const tracking = await this.returnService.trackReturnShipment(id);

      res.json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get all returns (Admin)
   */
  async getAllReturns(req: Request, res: Response) {
    try {
      const params = QueryReturnDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.returnService.getAllReturns(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Update return status (Admin)
   */
  async updateReturnStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = UpdateReturnStatusDTOSchema.parse(req.body);

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      const returnRequest = await this.returnService.updateReturnStatus(
        id,
        data
      );

      res.json({
        success: true,
        message: "Return status updated successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Schedule return pickup (Admin)
   */
  async scheduleReturnPickup(req: Request, res: Response) {
    try {
      const data = ScheduleReturnPickupDTOSchema.parse(req.body);
      const pickupDate = new Date(data.pickupDate);

      const returnRequest = await this.returnService.scheduleReturnPickup(
        data.returnId,
        pickupDate
      );

      res.json({
        success: true,
        message: "Return pickup scheduled successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Process refund (Admin)
   */
  async processRefund(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      const returnRequest = await this.returnService.processRefund(id);

      res.json({
        success: true,
        message: "Refund initiated successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Complete return (Admin)
   */
  async completeReturn(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      const returnRequest = await this.returnService.completeReturn(id);

      res.json({
        success: true,
        message: "Return completed successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
