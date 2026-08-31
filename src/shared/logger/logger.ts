import pino, { Logger as PinoLogger } from "pino";

export type LogContext = Record<string, unknown>;

/**
 * 🪵 Central Logger
 * Wraps Pino so the rest of the app never imports pino directly.
 * - Dev: pretty, colorized, human-readable
 * - Prod: structured JSON on stdout (picked up by PM2 / CloudWatch)
 *
 * Swap the underlying library later (e.g. winston) without touching callers.
 */
class AppLogger {
  private readonly logger: PinoLogger;

  constructor() {
    const isProd = process.env.NODE_ENV === "production";

    this.logger = pino({
      level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
      base: undefined, // omit pid/hostname noise; add back if you aggregate across many hosts
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: isProd
        ? undefined
        : {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
            },
          },
    });
  }

  info(message: string, context?: LogContext): void {
    context ? this.logger.info(context, message) : this.logger.info(message);
  }

  warn(message: string, context?: LogContext): void {
    context ? this.logger.warn(context, message) : this.logger.warn(message);
  }

  debug(message: string, context?: LogContext): void {
    context ? this.logger.debug(context, message) : this.logger.debug(message);
  }

  /**
   * Error logging normalizes native Error objects so stack traces are
   * never lost, and merges any extra correlation context (requestId, userId, etc).
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    const errDetails =
      error instanceof Error
        ? { err: { name: error.name, message: error.message, stack: error.stack } }
        : error !== undefined
        ? { err: error }
        : {};

    this.logger.error({ ...errDetails, ...context }, message);
  }

  /**
   * Tag every log line from a module/service with { module: name },
   * e.g. `const log = logger.child("OrderService")`.
   */
  child(moduleName: string): PinoLogger {
    return this.logger.child({ module: moduleName });
  }

  /** Raw pino instance — needed by pino-http and similar integrations. */
  get raw(): PinoLogger {
    return this.logger;
  }
}

export const logger = new AppLogger();
