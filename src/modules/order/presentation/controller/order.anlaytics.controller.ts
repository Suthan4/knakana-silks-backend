import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { OrderAnalyticsService } from "../../application/service/order.analytics.service.js";

@injectable()
export class OrderAnalyticsController {
  constructor(
    @inject(OrderAnalyticsService)
    private analyticsService: OrderAnalyticsService
  ) {}

  /**
   * Get comprehensive order analytics
   * GET /api/admin/orders/analytics
   */
  async getOrderAnalytics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const analytics = await this.analyticsService.getOrderAnalytics({
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get order statistics summary
   * GET /api/admin/orders/stats
   */
  async getOrderStats(req: Request, res: Response) {
    try {
      const stats = await this.analyticsService.getOrderStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}