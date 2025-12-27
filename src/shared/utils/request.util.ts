import { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  permissions?: any[];
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export class RequestUtil {
  /**
   * Get authenticated user from request
   */
  static getUser(req: Request): AuthenticatedUser | null {
    return (req as any).user || null;
  }

  /**
   * Get user ID from request
   */
  static getUserId(req: Request): string | null {
    const user = this.getUser(req);
    return user?.id || null;
  }

  /**
   * Get user role from request
   */
  static getUserRole(req: Request): string | null {
    const user = this.getUser(req);
    return user?.role || null;
  }

  /**
   * Get pagination params from query
   */
  static getPagination(req: Request): PaginationParams {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10)
    );
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  /**
   * Get sort params from query
   */
  static getSort(
    req: Request,
    defaultSort: string = "createdAt"
  ): { field: string; order: "asc" | "desc" } {
    const sortBy = (req.query.sortBy as string) || defaultSort;
    const sortOrder =
      (req.query.sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

    return { field: sortBy, order: sortOrder };
  }

  /**
   * Get search query from request
   */
  static getSearchQuery(req: Request): string | null {
    return (req.query.search as string) || (req.query.q as string) || null;
  }

  /**
   * Get IP address from request
   */
  static getIpAddress(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Get user agent from request
   */
  static getUserAgent(req: Request): string {
    return req.headers["user-agent"] || "unknown";
  }

  /**
   * Check if request is from mobile device
   */
  static isMobile(req: Request): boolean {
    const userAgent = this.getUserAgent(req).toLowerCase();
    return /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );
  }

  /**
   * Get filters from query params
   */
  static getFilters(
    req: Request,
    allowedFilters: string[]
  ): Record<string, any> {
    const filters: Record<string, any> = {};

    allowedFilters.forEach((filter) => {
      if (req.query[filter] !== undefined) {
        filters[filter] = req.query[filter];
      }
    });

    return filters;
  }

  /**
   * Parse boolean from query param
   */
  static parseBoolean(value: any): boolean | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value;

    const stringValue = String(value).toLowerCase();
    if (stringValue === "true" || stringValue === "1") return true;
    if (stringValue === "false" || stringValue === "0") return false;

    return null;
  }

  /**
   * Get date range from query params
   */
  static getDateRange(req: Request): { startDate?: Date; endDate?: Date } {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : undefined;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : undefined;

    return { startDate, endDate };
  }
}
