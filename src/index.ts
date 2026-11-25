import "dotenv/config";
import { getPrismaClient } from "./lib/database/prisma.js";
import { createApp } from "./app.js";
import { logger } from "./shared/logger/logger.js";
import { container } from "tsyringe";
import { EmailJobWorker } from "./modules/notification/application/service/email-job.worker.js";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await getPrismaClient.$connect();
    logger.info("Database connected");

    const app = createApp();

    // Background transactional email delivery. Jobs are already committed to
    // PostgreSQL before the worker reads them, so request APIs never send SMTP.
    const emailJobWorker = container.resolve(EmailJobWorker);
    emailJobWorker.start();

    const server = app.listen(PORT, () => {
      logger.info("Server started", {
        port: PORT,
        environment: process.env.NODE_ENV,
      });
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} is already in use`, error, {
          hint: `Kill the process using: netstat -ano | findstr :${PORT}, or change PORT in .env`,
        });
        process.exit(1);
      } else {
        throw error;
      }
    });

    // Give in-flight requests a chance to finish instead of dying mid-request.
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received: stopping email worker and closing HTTP server`);
      await emailJobWorker.stop();
      server.close(async () => {
        await getPrismaClient.$disconnect();
        logger.info("Shutdown complete");
        process.exit(0);
      });

      // Force-exit if something (e.g. a stuck socket) blocks graceful close.
      setTimeout(() => {
        logger.error("Forced shutdown after timeout waiting for connections to close");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Server startup failed", error);
    process.exit(1);
  }
};

// Last line of defense: log crashes instead of letting them vanish silently,
// then exit — an unhandled exception leaves the process in an unknown state.
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
  process.exit(1);
});

startServer();
