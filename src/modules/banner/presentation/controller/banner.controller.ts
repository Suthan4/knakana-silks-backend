import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { BannerService } from "../../application/service/banner.service.js";
import {
  CreateBannerDTOSchema,
  QueryBannerDTOSchema,
  UpdateBannerDTOSchema,
} from "../../application/dtos/banner.dto.js";

@injectable()
export class BannerController {
  constructor(@inject(BannerService) private bannerService: BannerService) {}

  async createBanner(req: Request, res: Response) {
    try {
      const data = CreateBannerDTOSchema.parse(req.body);
      const banner = await this.bannerService.createBanner(data);

      res.status(201).json({
        success: true,
        message: "Banner created successfully",
        data: banner,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateBanner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Banner ID is required" });
        return;
      }
      const data = UpdateBannerDTOSchema.parse(req.body);
      const banner = await this.bannerService.updateBanner(id, data);

      res.json({
        success: true,
        message: "Banner updated successfully",
        data: banner,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteBanner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Banner ID is required" });
        return;
      }
      await this.bannerService.deleteBanner(id);

      res.json({
        success: true,
        message: "Banner deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getBanner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Banner ID is required" });
        return;
      }
      const banner = await this.bannerService.getBanner(id);

      res.json({
        success: true,
        data: banner,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getBanners(req: Request, res: Response) {
    try {
      const params = QueryBannerDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
            ? false
            : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.bannerService.getBanners(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getActiveBanners(req: Request, res: Response) {
    try {
      const banners = await this.bannerService.getActiveBanners();

      res.json({
        success: true,
        data: banners,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
