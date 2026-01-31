import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { StockManagementService } from "../../application/stock.management.service.js";

const ManualStockAdjustmentSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  warehouseId: z.string(),
  quantity: z.number().int(), // Can be negative or positive
  reason: z.string().min(5),
  notes: z.string().optional(),
});

const CheckStockSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  warehouseId: z.string(),
  requiredQuantity: z.number().int().positive(),
});

@injectable()
export class StockController {
  constructor(
    @inject(StockManagementService)
    private stockManagementService: StockManagementService
  ) {}

  /**
   * Get low stock alerts (Admin)
   * GET /api/admin/stock/low-stock-alerts
   */
  async getLowStockAlerts(req: Request, res: Response) {
    try {
      const alerts = await this.stockManagementService.getLowStockAlerts();

      res.json({
        success: true,
        message: `Found ${alerts.length} low stock items`,
        data: alerts,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get stock history for a product (Admin)
   * GET /api/admin/stock/history/:productId
   * Query: variantId?, warehouseId?
   */
  async getStockHistory(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const { variantId, warehouseId } = req.query;

      if (!productId || Array.isArray(productId)) {
        res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
        return;
      }

      const history = await this.stockManagementService.getStockHistory(
        BigInt(productId),
        variantId ? BigInt(variantId as string) : undefined,
        warehouseId ? BigInt(warehouseId as string) : undefined
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Manual stock adjustment (Admin)
   * POST /api/admin/stock/adjust
   * Body: { productId, variantId?, warehouseId, quantity, reason, notes? }
   */
  async manualStockAdjustment(req: Request, res: Response) {
    try {
      const adminId = req.user?.userId; // Assuming admin is authenticated
      const data = ManualStockAdjustmentSchema.parse(req.body);

      await this.stockManagementService.adjustStock({
        productId: BigInt(data.productId),
        variantId: data.variantId ? BigInt(data.variantId) : undefined,
        warehouseId: BigInt(data.warehouseId),
        quantity: data.quantity,
        reason: "MANUAL_ADJUSTMENT" as any,
        createdBy: adminId || "ADMIN",
        notes: data.reason + (data.notes ? ` - ${data.notes}` : ""),
      });

      res.json({
        success: true,
        message: `Stock adjusted by ${data.quantity > 0 ? "+" : ""}${
          data.quantity
        }`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Check stock availability (Public/User)
   * POST /api/stock/check-availability
   * Body: { productId, variantId?, warehouseId, requiredQuantity }
   */
  async checkStockAvailability(req: Request, res: Response) {
    try {
      const data = CheckStockSchema.parse(req.body);

      const result = await this.stockManagementService.checkStockAvailability(
        BigInt(data.productId),
        data.variantId ? BigInt(data.variantId) : undefined,
        BigInt(data.warehouseId),
        data.requiredQuantity
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}