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
import categoryRoutes from "./modules/category/presentation/routes/category.routes.js";
import productRoutes from "./modules/product/presentation/routes/product.routes.js";
import addressRoutes from "./modules/address/presentation/routes/address.routes.js";
import cartRoutes from "./modules/cart/presentation/routes/cart.routes.js";
import wishlistRoutes from "./modules/wishlist/presentation/routes/wishlist.routes.js";
import bannerRoutes from "./modules/banner/presentation/routes/banner.routes.js";
import home_sectionRoutes from "./modules/home_section/presentation/routes/home_section.routes.js";
import orderRoutes from "./modules/order/presentation/routes/order.routes.js";
import paymentRoutes from "./modules/payment/presentation/routes/payment.routes.js";
import shipmentRoutes from "./modules/shipment/presentation/routes/shipment.routes.js";
import couponRoutes from "./modules/coupon/presentation/routes/coupon.routes.js";
import consultationRoutes from "./modules/consultation/presentation/routes/consultation.routes.js";
import warehouseRoutes from "./modules/warehouse/presentation/routes/warehouse.routes.js";

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
  app.use("/api", categoryRoutes);
  app.use("/api", productRoutes);
  app.use("/api", addressRoutes);
  app.use("/api", cartRoutes);
  app.use("/api", wishlistRoutes);
  app.use("/api", bannerRoutes);
  app.use("/api", home_sectionRoutes);
  app.use("/api", orderRoutes);
  app.use("/api", paymentRoutes);
  app.use("/api", shipmentRoutes);
  app.use("/api", couponRoutes);
  app.use("/api", consultationRoutes);
  app.use("/api", warehouseRoutes);

  app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  app.use(errorHandler);

  return app;
};
