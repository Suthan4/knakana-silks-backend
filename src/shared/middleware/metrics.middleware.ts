import { Request, Response, NextFunction } from "express";
import client from "prom-client";

/**
 * 📊 Prometheus Metrics
 *
 * Exposes RED metrics (Rate, Errors, Duration) for every HTTP route, plus
 * Node.js process defaults (CPU, RSS/heap memory, event loop lag, GC pauses).
 * Scraped by Prometheus at GET /metrics every ~15s (see docker-compose setup).
 */
export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});

const httpRequestErrorsTotal = new client.Counter({
  name: "http_request_errors_total",
  help: "Total number of HTTP requests that resulted in a 4xx/5xx response",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});

/**
 * Cache hit/miss counter — increment from cacheService.get() so the
 * "Redis cache hit ratio" panel in Grafana has real data.
 * cacheService.get() can call metricsCacheLookupsTotal.inc({ result: 'hit' | 'miss' })
 */
export const cacheLookupsTotal = new client.Counter({
  name: "cache_lookups_total",
  help: "Total cache lookups by result (hit/miss)",
  labelNames: ["result"],
  registers: [metricsRegistry],
});

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Don't let the scrape endpoint itself skew the stats.
  if (req.path === "/metrics" || req.path === "/health") {
    return next();
  }

  const start = process.hrtime();

  res.on("finish", () => {
    // Prefer the matched route pattern (/api/products/:id) over the raw url
    // (/api/products/123) so we don't create a unique metric per product id.
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;

    const [seconds, nanoseconds] = process.hrtime(start);
    const durationInSeconds = seconds + nanoseconds / 1e9;

    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };

    httpRequestDurationSeconds.observe(labels, durationInSeconds);
    httpRequestsTotal.inc(labels);

    if (res.statusCode >= 400) {
      httpRequestErrorsTotal.inc(labels);
    }
  });

  next();
};

export const metricsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : "metrics error");
  }
};
