import "reflect-metadata";
import express, { Application } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { setupContainer } from "./config/container.js";

setupContainer();
import authRoutes from "./modules/auth/presentation/auth.routes.js";

export const createApp = (): Application => {

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      credentials: process.env.CORS_CREDENTIALS === "true",
    })
  );

  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  });
  app.use("/api", limiter);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser(process.env.COOKIE_SECRET));

  app.use("/api", authRoutes);

  app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  app.use(errorHandler);

  return app;
};
