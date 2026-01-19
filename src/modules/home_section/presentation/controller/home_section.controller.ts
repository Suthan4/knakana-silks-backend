import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { HomeSectionService } from "../../application/service/home_section.service.js";
import { CreateHomeSectionDTOSchema, QueryHomeSectionDTOSchema, UpdateHomeSectionDTOSchema } from "../../application/dtos/home_section.dtos.js";


@injectable()
export class HomeSectionController {
  constructor(
    @inject(HomeSectionService) private homeSectionService: HomeSectionService
  ) {}

  async createHomeSection(req: Request, res: Response) {
    try {
      // FIXED: Handle both wrapped and unwrapped data
      const requestData = req.body.data || req.body;
      const data = CreateHomeSectionDTOSchema.parse(requestData);
      const section = await this.homeSectionService.createHomeSection(data);

      res.status(201).json({
        success: true,
        message: "Home section created successfully",
        data: section,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateHomeSection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Section ID is required" });
        return;
      }
      
      // FIXED: Handle both wrapped and unwrapped data
      const requestData = req.body.data || req.body;
      const data = UpdateHomeSectionDTOSchema.parse(requestData);
      const section = await this.homeSectionService.updateHomeSection(id, data);

      res.json({
        success: true,
        message: "Home section updated successfully",
        data: section,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteHomeSection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Section ID is required" });
        return;
      }
      await this.homeSectionService.deleteHomeSection(id);

      res.json({
        success: true,
        message: "Home section deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getHomeSection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Section ID is required" });
        return;
      }
      const section = await this.homeSectionService.getHomeSection(id);

      res.json({
        success: true,
        data: section,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getHomeSections(req: Request, res: Response) {
    try {
      const params = QueryHomeSectionDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
            ? false
            : undefined,
        type: req.query.type as any,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.homeSectionService.getHomeSections(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getActiveSections(req: Request, res: Response) {
    try {
      const sections = await this.homeSectionService.getActiveSections();

      res.json({
        success: true,
        data: sections,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}