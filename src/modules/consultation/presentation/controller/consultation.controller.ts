import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ConsultationService } from "../../application/service/consultation.service.js";
import { CreateConsultationDTOSchema, QueryConsultationDTOSchema, UpdateConsultationStatusDTOSchema } from "../../application/dtos/consultation.dtos.js";


@injectable()
export class ConsultationController {
  constructor(
    @inject(ConsultationService)
    private consultationService: ConsultationService
  ) {}

  async createConsultation(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = CreateConsultationDTOSchema.parse(req.body);

      const consultation = await this.consultationService.createConsultation(
        userId,
        data
      );

      res.status(201).json({
        success: true,
        message: "Consultation request created successfully",
        data: consultation,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async cancelConsultation(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Consultation ID is required" });
        return;
      }

      const consultation = await this.consultationService.cancelConsultation(
        userId,
        id
      );

      res.json({
        success: true,
        message: "Consultation cancelled successfully",
        data: consultation,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getConsultation(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Consultation ID is required" });
        return;
      }

      const consultation = await this.consultationService.getConsultation(
        userId,
        id
      );

      res.json({
        success: true,
        data: consultation,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getUserConsultations(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const params = QueryConsultationDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        platform: req.query.platform as any,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.consultationService.getUserConsultations(
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

  // Admin endpoints
  async getAllConsultations(req: Request, res: Response) {
    try {
      const params = QueryConsultationDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as any,
        platform: req.query.platform as any,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.consultationService.getAllConsultations(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getAdminConsultation(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Consultation ID is required" });
        return;
      }

      const consultation = await this.consultationService.getAdminConsultation(
        id
      );

      res.json({
        success: true,
        data: consultation,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async updateConsultationStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const approvedBy = req.user!.email;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Consultation ID is required" });
        return;
      }

      const data = UpdateConsultationStatusDTOSchema.parse(req.body);
      const consultation =
        await this.consultationService.updateConsultationStatus(id, {
          ...data,
          approvedBy,
        });

      res.json({
        success: true,
        message: "Consultation status updated successfully",
        data: consultation,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
