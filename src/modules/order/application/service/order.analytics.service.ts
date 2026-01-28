import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "../../infrastructure/interface/Iorderrepository.js";
import { OrderStatus, PaymentStatus } from "@/generated/prisma/enums.js";

interface OrderAnalytics {
  overview: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    pendingOrders: number;
    processingOrders: number;
    shippedOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
  };
  revenueByStatus: {
    status: string;
    revenue: number;
    count: number;
  }[];
  recentOrders: any[];
  monthlyTrends: {
    month: string;
    orders: number;
    revenue: number;
  }[];
  topProducts: {
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }[];
}

@injectable()
export class OrderAnalyticsService {
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository
  ) {}

  /**
   * Get comprehensive order analytics
   */
  async getOrderAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<OrderAnalytics> {
    const where: any = {};

    // Date filtering
    if (params?.startDate || params?.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }

    // Fetch all orders with necessary relations
    const orders = await this.orderRepository.findAll({
      skip: 0,
      take: 10000, // Get all for analytics
      where,
      orderBy: { createdAt: "desc" },
    });

    // Calculate overview stats
    const totalOrders = orders.length;
    const totalRevenue = orders
      .filter((o) => o.payment?.status === PaymentStatus.SUCCESS)
      .reduce((sum, order) => sum + Number(order.total), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const pendingOrders = orders.filter(
      (o) => o.status === OrderStatus.PENDING
    ).length;
    const processingOrders = orders.filter(
      (o) => o.status === OrderStatus.PROCESSING
    ).length;
    const shippedOrders = orders.filter(
      (o) => o.status === OrderStatus.SHIPPED
    ).length;
    const deliveredOrders = orders.filter(
      (o) => o.status === OrderStatus.DELIVERED
    ).length;
    const cancelledOrders = orders.filter(
      (o) => o.status === OrderStatus.CANCELLED
    ).length;

    // Revenue by status
    const revenueByStatus = Object.values(OrderStatus).map((status) => {
      const statusOrders = orders.filter((o) => o.status === status);
      return {
        status,
        revenue: statusOrders.reduce(
          (sum, order) => sum + Number(order.total),
          0
        ),
        count: statusOrders.length,
      };
    });

    // Recent orders (last 10)
    const recentOrders = orders.slice(0, 10);

    // Monthly trends (last 12 months)
    const monthlyTrends = this.calculateMonthlyTrends(orders);

    // Top products
    const topProducts = this.calculateTopProducts(orders);

    return {
      overview: {
        totalOrders,
        totalRevenue,
        averageOrderValue,
        pendingOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        cancelledOrders,
      },
      revenueByStatus,
      recentOrders,
      monthlyTrends,
      topProducts,
    };
  }

  /**
   * Calculate monthly order trends
   */
  private calculateMonthlyTrends(orders: any[]) {
    const now = new Date();
    const trends: { month: string; orders: number; revenue: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthOrders = orders.filter((o) => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= monthStart && orderDate <= monthEnd;
      });

      trends.push({
        month: date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        orders: monthOrders.length,
        revenue: monthOrders.reduce(
          (sum, order) => sum + Number(order.total),
          0
        ),
      });
    }

    return trends;
  }

  /**
   * Calculate top selling products
   */
  private calculateTopProducts(orders: any[]) {
    const productMap = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();

    orders.forEach((order) => {
      order.items.forEach((item: any) => {
        const key = item.productId.toString();
        const existing = productMap.get(key) || {
          name: item.product.name,
          quantity: 0,
          revenue: 0,
        };

        productMap.set(key, {
          name: existing.name,
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + Number(item.price) * item.quantity,
        });
      });
    });

    return Array.from(productMap.entries())
      .map(([productId, data]) => ({
        productId,
        productName: data.name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  /**
   * Get order statistics summary
   */
  async getOrderStats() {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(
      today.setDate(today.getDate() - today.getDay())
    );
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [
      todayOrders,
      weekOrders,
      monthOrders,
      yearOrders,
      totalOrders,
      pendingOrders,
      cancelledToday,
    ] = await Promise.all([
      this.orderRepository.count({
        createdAt: { gte: startOfToday },
      }),
      this.orderRepository.count({
        createdAt: { gte: startOfWeek },
      }),
      this.orderRepository.count({
        createdAt: { gte: startOfMonth },
      }),
      this.orderRepository.count({
        createdAt: { gte: startOfYear },
      }),
      this.orderRepository.count({}),
      this.orderRepository.count({
        status: OrderStatus.PENDING,
      }),
      this.orderRepository.count({
        status: OrderStatus.CANCELLED,
        createdAt: { gte: startOfToday },
      }),
    ]);

    return {
      today: todayOrders,
      thisWeek: weekOrders,
      thisMonth: monthOrders,
      thisYear: yearOrders,
      total: totalOrders,
      pending: pendingOrders,
      cancelledToday,
    };
  }
}