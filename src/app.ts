import "reflect-metadata";
import express, { Application } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { setupContainer } from "./config/container.js";
setupContainer();
setupShipmentCronJobs(); // ✅ ADD THIS



// Routes
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
import uploadRoutes from "./shared/common/routes/s3.routes.js";
import productRequestRoutes from "./modules/product-request/presentation/routes/product-request.routes.js";
import searchRoutes from "./modules/search/presentation/routes/search.routes.js";
import shippingCalculatorRoutes from "./modules/shipment/presentation/routes/shipping.calculator.routes.js";
import { setupShipmentCronJobs } from "./modules/shipment/shipment.corn.setup.js";
import returnRoutes from "./modules/return/presentation/routes/return.routes.js";

export const createApp = (): Application => {
  const app = express();

  /* --------------------------------------------------
   * Trust proxy (REQUIRED for HTTPS on Render)
   * -------------------------------------------------- */
  app.set("trust proxy", 1);

  /* --------------------------------------------------
   * Security & CORS
   * -------------------------------------------------- */
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

const corsOptions = {
  origin: [
    "http://localhost:3001",
    "http://localhost:5173",
    "https://qa.admin.kankanasilks.com",
    "https://admin.kankanasilks.com",
    "https://kankanasilks.com",
    "https://qa.kankanasilks.com",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
};

app.use(cors(corsOptions));

// ✅ IMPORTANT: Preflight must use SAME config
app.options("*", cors(corsOptions));


  /* --------------------------------------------------
   * Rate Limiter (EXCLUDE uploads)
   * -------------------------------------------------- */
  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  });

  app.use("/api", (req, res, next) => {
    // 🚫 DO NOT rate-limit file uploads (multer needs raw stream)
    if (req.path.startsWith("/upload")) {
      return next();
    }
    return limiter(req, res, next);
  });

  /* --------------------------------------------------
   * Upload routes FIRST (before body parsers)
   * -------------------------------------------------- */
  app.use("/api", uploadRoutes);

  /* --------------------------------------------------
   * Body parsers (AFTER uploads)
   * -------------------------------------------------- */
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser(process.env.COOKIE_SECRET));

  /* --------------------------------------------------
   * Application routes
   * -------------------------------------------------- */
  app.use("/api", authRoutes);
  app.use("/api", categoryRoutes);
  app.use("/api", productRoutes);
  app.use("/api", addressRoutes);
  app.use("/api", cartRoutes);
  app.use("/api", wishlistRoutes);
  app.use("/api", bannerRoutes);
  app.use("/api", home_sectionRoutes);
  app.use("/api", returnRoutes);
  app.use("/api", orderRoutes);
  app.use("/api", paymentRoutes);
  app.use("/api", shipmentRoutes);
  app.use("/api", couponRoutes);
  app.use("/api", consultationRoutes);
  app.use("/api", warehouseRoutes);
  app.use("/api", productRequestRoutes);
  app.use("/api", searchRoutes);
  app.use("/api", shippingCalculatorRoutes);

  /* --------------------------------------------------
   * Health check
   * -------------------------------------------------- */

  app.get("/", (req, res) => {
  res.status(200).send("OK");
});
  app.get("/health", (_req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  /* --------------------------------------------------
   * Global error handler
   * -------------------------------------------------- */
  app.use(errorHandler);

  return app;
};