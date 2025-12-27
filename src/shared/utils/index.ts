import { APP_CONSTANTS } from "../constants/index.js";
import { PaginatedResponse } from "../types/index.js";
import { PaginationParams } from "./request.util.js";

export class PaginationUtil {
  static getPaginationParams(page?: number, limit?: number): PaginationParams {
    const validPage = Math.max(1, page || APP_CONSTANTS.DEFAULT_PAGE);
    const validLimit = Math.min(
      Math.max(1, limit || APP_CONSTANTS.DEFAULT_PAGE_SIZE),
      APP_CONSTANTS.MAX_PAGE_SIZE
    );

    return {
      page: validPage,
      limit: validLimit,
      skip: (validPage - 1) * validLimit,
    };
  }

  static buildPaginatedResponse<T>(
    data: T[],
    total: number,
    params: PaginationParams
  ): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / params.limit);

    return {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages,
        hasNext: params.page < totalPages,
        hasPrev: params.page > 1,
      },
    };
  }

  static getSkip(params: PaginationParams): number {
    return (params.page - 1) * params.limit;
  }
}

export class SlugUtil {
  static generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  static generateUniqueSlug(text: string, existingSlugs: string[]): string {
    let slug = this.generateSlug(text);
    let counter = 1;

    while (existingSlugs.includes(slug)) {
      slug = `${this.generateSlug(text)}-${counter}`;
      counter++;
    }

    return slug;
  }
}

export class DateUtil {
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static isExpired(expiryDate: Date): boolean {
    return new Date() > expiryDate;
  }

  static formatDate(date: Date): string {
    return date.toISOString().split("T")[0] ?? "";
  }
}

export class NumberUtil {
  static generateOrderNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    return `${APP_CONSTANTS.ORDER_NUMBER_PREFIX}-${timestamp}-${random}`;
  }

  static formatCurrency(amount: number, currency: string = "INR"): string {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
    }).format(amount);
  }

  static roundToTwo(num: number): number {
    return Math.round(num * 100) / 100;
  }
}

export class ValidationUtil {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  }

  static isValidPincode(pincode: string): boolean {
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    return pincodeRegex.test(pincode);
  }

  static sanitizeString(str: string): string {
    return str.trim().replace(/\s+/g, " ");
  }
}

export class AsyncUtil {
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
    throw new Error("Max retries exceeded");
  }

  static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Re-export new utilities
export * from "./response.util.js";
export * from "./request.util.js";
