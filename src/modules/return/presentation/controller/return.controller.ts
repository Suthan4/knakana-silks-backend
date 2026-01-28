import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ReturnService } from "../../application/service/return.service.js";
import {
  CreateReturnDTOSchema,
  UpdateReturnStatusDTOSchema,
  QueryReturnDTOSchema,
} from "../../application/dtos/return.dtos.js";

@injectable()
export class ReturnController {
  constructor(@inject(ReturnService) private returnService: ReturnService) {}

  /**
   * ✅ Check return eligibility (User)
   * GET /api/returns/eligibility/:orderId
   * Used by frontend to show/hide return button and display countdown
   */
  async checkReturnEligibility(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { orderId } = req.params;

      if (!orderId || Array.isArray(orderId)) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const eligibility = await this.returnService.checkReturnEligibility(
        userId,
        orderId
      );

      res.json({
        success: true,
        data: eligibility,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Create return request (User)
   * POST /api/returns
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
   * GET /api/returns/my-returns
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
   * GET /api/returns/:id
   */
  async getReturn(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id || Array.isArray(id)) {
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
   * GET /api/returns/:id/track
   */
  async trackReturnShipment(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id || Array.isArray(id)) {
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
   * GET /api/admin/returns
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
   * ✅ Approve return (Admin)
   * POST /api/admin/returns/:id/approve
   */
  async approveReturn(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;

      if (!id || Array.isArray(id)) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      const returnRequest = await this.returnService.approveReturn(
        id,
        adminNotes
      );

      res.json({
        success: true,
        message: "Return approved successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * ✅ Reject return (Admin)
   * POST /api/admin/returns/:id/reject
   */
  async rejectReturn(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { rejectionReason, adminNotes } = req.body;

      if (!id || Array.isArray(id)) {
        res
          .status(400)
          .json({ success: false, message: "Return ID is required" });
        return;
      }

      if (!rejectionReason) {
        res
          .status(400)
          .json({ success: false, message: "Rejection reason is required" });
        return;
      }

      const returnRequest = await this.returnService.rejectReturn(
        id,
        rejectionReason,
        adminNotes
      );

      res.json({
        success: true,
        message: "Return rejected successfully",
        data: returnRequest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Process refund (Admin)
   * POST /api/admin/returns/:id/process-refund
   */
  async processRefund(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id || Array.isArray(id)) {
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
}