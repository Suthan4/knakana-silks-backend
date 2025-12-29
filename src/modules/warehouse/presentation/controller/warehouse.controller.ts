import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { WarehouseService } from "../../application/service/warehouse.service.js";
import {
  CreateWarehouseDTOSchema,
  UpdateWarehouseDTOSchema,
  QueryWarehouseDTOSchema,
} from "../../application/dtos/warehouse.dtos.js";

@injectable()
export class WarehouseController {
  constructor(
    @inject(WarehouseService) private warehouseService: WarehouseService
  ) {}

  async createWarehouse(req: Request, res: Response) {
    try {
      const data = CreateWarehouseDTOSchema.parse(req.body);
      const warehouse = await this.warehouseService.createWarehouse(data);

      res.status(201).json({
        success: true,
        message: "Warehouse created successfully",
        data: warehouse,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateWarehouse(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Warehouse ID is required" });
        return;
      }
      const data = UpdateWarehouseDTOSchema.parse(req.body);
      const warehouse = await this.warehouseService.updateWarehouse(id, data);

      res.json({
        success: true,
        message: "Warehouse updated successfully",
        data: warehouse,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteWarehouse(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Warehouse ID is required" });
        return;
      }
      await this.warehouseService.deleteWarehouse(id);

      res.json({
        success: true,
        message: "Warehouse deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getWarehouse(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Warehouse ID is required" });
        return;
      }
      const warehouse = await this.warehouseService.getWarehouse(id);

      res.json({
        success: true,
        data: warehouse,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getWarehouses(req: Request, res: Response) {
    try {
      const params = QueryWarehouseDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
            ? false
            : undefined,
        search: req.query.search as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.warehouseService.getWarehouses(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getActiveWarehouses(req: Request, res: Response) {
    try {
      const warehouses = await this.warehouseService.getActiveWarehouses();

      res.json({
        success: true,
        data: warehouses,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getWarehouseStock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Warehouse ID is required" });
        return;
      }
      const stock = await this.warehouseService.getWarehouseStock(id);

      res.json({
        success: true,
        data: stock,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
}
