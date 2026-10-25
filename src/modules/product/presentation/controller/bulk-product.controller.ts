import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";
import { BulkProductService } from "../../application/service/bulk-product.service.js";
import { ValidationError } from "@/shared/utils/errors.js";

@injectable()
export class BulkProductController {
  constructor(
    @inject(BulkProductService) private bulkProductService: BulkProductService
  ) {}

  /**
   * GET /api/products/bulk/categories-tree
   * Returns category hierarchy with full paths and leaf indicators.
   */
  async getCategoriesTree(req: Request, res: Response): Promise<void> {
    try {
      const hierarchy = await this.bulkProductService.getCategoryHierarchy();
      res.status(200).json({
        success: true,
        message: "Category hierarchy retrieved successfully",
        data: hierarchy,
      });
    } catch (error: any) {
      console.error("❌ Error loading category hierarchy:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to load category hierarchy",
      });
    }
  }

  /**
   * GET /api/products/bulk/warehouses
   * Returns active warehouses for bulk product inventory assignment.
   */
  async getWarehouses(req: Request, res: Response): Promise<void> {
    try {
      const warehouses = await this.bulkProductService.getWarehouseLookupList();
      res.status(200).json({
        success: true,
        message: "Warehouses retrieved successfully",
        data: warehouses,
      });
    } catch (error: any) {
      console.error("❌ Error loading warehouses:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to load warehouses",
      });
    }
  }

  /**
   * GET /api/products/bulk/template
   * Downloads a customized .xlsx template with selected categories in dropdowns.
   */
  async downloadTemplate(req: Request, res: Response): Promise<void> {
    try {
      let categoryIds: string[] | undefined;
      const rawCategoryIds = req.query.categoryIds;

      if (typeof rawCategoryIds === "string") {
        categoryIds = rawCategoryIds.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(rawCategoryIds)) {
        categoryIds = (rawCategoryIds as string[]).map((s) => String(s).trim()).filter(Boolean);
      }

      const buffer = await this.bulkProductService.generateTemplate(categoryIds);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="kankana-silks-bulk-product-template.xlsx"'
      );
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).send(buffer);
    } catch (error: any) {
      console.error("❌ Error generating template:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to generate Excel template",
      });
    }
  }

  /**
   * POST /api/products/bulk/export
   * Exports current dashboard products to a downloadable .xlsx workbook.
   */
  async exportProducts(req: Request, res: Response): Promise<void> {
    try {
      const { products, categoryIds } = req.body;
      if (!products || !Array.isArray(products)) {
        throw new ValidationError("Products array is required for export.");
      }

      const buffer = await this.bulkProductService.exportProducts(products, categoryIds);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="kankana-silks-products-export.xlsx"'
      );
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).send(buffer);
    } catch (error: any) {
      console.error("❌ Error exporting products:", error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || "Failed to export products workbook",
      });
    }
  }

  /**
   * POST /api/products/bulk/validate
   * Validates products from either an uploaded Excel file or JSON payload.
   */
  async validateBulk(req: Request, res: Response): Promise<void> {
    try {
      if (req.file) {
        // File upload workflow
        const validation = await this.bulkProductService.validateWorkbookBuffer(
          req.file.buffer
        );
        res.status(200).json({
          success: true,
          message: "Workbook validated successfully",
          data: validation,
        });
      } else if (req.body.products && Array.isArray(req.body.products)) {
        // JSON workflow
        const validation = await this.bulkProductService.validateParsedProducts(
          req.body.products
        );
        res.status(200).json({
          success: true,
          message: "Products validated successfully",
          data: validation,
        });
      } else {
        throw new ValidationError(
          "Either an Excel file or a 'products' JSON array is required."
        );
      }
    } catch (error: any) {
      console.error("❌ Error in validateBulk:", error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || "Validation failed",
      });
    }
  }

  /**
   * POST /api/products/bulk/import
   * Performs atomic per-product import.
   */
  async importBulk(req: Request, res: Response): Promise<void> {
    try {
      let productsToImport: any[] = [];

      if (req.file) {
        const validation = await this.bulkProductService.validateWorkbookBuffer(
          req.file.buffer
        );
        productsToImport = validation.products;
      } else if (req.body.products && Array.isArray(req.body.products)) {
        productsToImport = req.body.products;
      } else {
        throw new ValidationError(
          "Either an Excel file or a 'products' JSON array is required for import."
        );
      }

      if (productsToImport.length === 0) {
        throw new ValidationError("No products to import.");
      }

      const result = await this.bulkProductService.importProducts(productsToImport);
      res.status(200).json({
        success: true,
        message: "Bulk import completed",
        data: result,
      });
    } catch (error: any) {
      console.error("❌ Error in importBulk:", error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || "Bulk import failed",
      });
    }
  }
}
