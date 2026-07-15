import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

const rateLimitResponse = {
  success: false,
  code: "RATE_LIMIT_EXCEEDED",
  message: "Too many requests. Please wait and try again.",
};

const getIpKey = (req: Request): string => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  return `ip:${ipKeyGenerator(ip)}`;
};

/**
 * Use this only after authenticate middleware.
 */
const getUserOrIpKey = (req: Request): string => {
  if (req.user?.userId) {
    return `user:${req.user.userId}`;
  }

  return getIpKey(req);
};

/**
 * General emergency protection.
 *
 * Keep this high because individual routes have their own limits.
 */
export const globalApiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 1500,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getIpKey,

  skip: (req) => req.method === "OPTIONS",

  message: rateLimitResponse,
});

/**
 * Public product and category listing.
 */
export const publicCatalogLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  limit: Number(process.env.PUBLIC_CATALOG_RATE_LIMIT_MAX) || 300,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getIpKey,
  message: rateLimitResponse,
});

/**
 * Admin product/category GET requests.
 *
 * Place after authenticate.
 */
export const adminCatalogReadLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.ADMIN_CATALOG_READ_LIMIT_MAX) || 600,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getUserOrIpKey,
  message: rateLimitResponse,
});

/**
 * Admin create, update and delete operations.
 *
 * Place after authenticate.
 */
export const adminCatalogWriteLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.ADMIN_CATALOG_WRITE_LIMIT_MAX) || 300,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getUserOrIpKey,
  message: rateLimitResponse,
});

/**
 * Cart and wishlist GET requests.
 */
export const commerceReadLimiter = rateLimit({
  windowMs: FIVE_MINUTES,
  limit: Number(process.env.COMMERCE_READ_LIMIT_MAX) || 300,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getUserOrIpKey,
  message: rateLimitResponse,
});

/**
 * Cart and wishlist mutation requests.
 */
export const commerceWriteLimiter = rateLimit({
  windowMs: FIVE_MINUTES,
  limit: Number(process.env.COMMERCE_WRITE_LIMIT_MAX) || 120,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getUserOrIpKey,
  message: rateLimitResponse,
});