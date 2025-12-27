export const APP_CONSTANTS = {
  // Pagination
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // JWT
  JWT_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",

  // Cookie
  COOKIE_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds

  // File Upload
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],

  // Cart
  CART_EXPIRY_DAYS: 30,

  // Order
  ORDER_NUMBER_PREFIX: "ORD",

  // Return Policy
  RETURN_WINDOW_DAYS: 7,

  // Stock
  LOW_STOCK_THRESHOLD: 10,

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

export const USER_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export const ORDER_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;

export const RETURN_STATUS = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
} as const;

export const CONSULTATION_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export const NOTIFICATION_TYPE = {
  ORDER: "ORDER",
  PAYMENT: "PAYMENT",
  SHIPMENT: "SHIPMENT",
  RETURN: "RETURN",
  SYSTEM: "SYSTEM",
} as const;
