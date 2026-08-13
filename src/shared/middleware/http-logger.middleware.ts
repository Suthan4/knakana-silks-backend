import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { logger } from "../logger/logger.js";

/**
 * 🌐 HTTP Request Logging Middleware
 *
 * - Logs every incoming request / outgoing response automatically (method,
 *   route, status code, response time) — no manual logging needed per route.
 * - Generates (or reuses) an `x-request-id` so a single user request can be
 *   traced across every log line and every downstream service call.
 * - Attaches `req.log`, a Pino child logger already tagged with the request
 *   id, so module/service code can do `req.log.info(...)` and it correlates
 *   automatically. See order.controller pattern for usage.
 */
export const httpLoggerMiddleware = pinoHttp({
  logger: logger.raw,

  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },

  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  customSuccessMessage: (req, res) => `${req.method} ${req.url} completed`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} failed: ${err.message}`,

  // Avoid dumping large/sensitive bodies into logs by default.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  // Keep noise down: skip logging for the metrics scrape and health checks.
  autoLogging: {
    ignore: (req) => req.url === "/metrics" || req.url === "/health",
  },
});
