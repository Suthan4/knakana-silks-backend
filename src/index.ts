import "dotenv/config";
import { getPrismaClient } from "./lib/database/prisma.js";
import { createApp } from "./app.js";

(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};
// import { setupContainer } from "./container";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // setupContainer();

    await getPrismaClient.$connect();
    console.log("✅ Database connected");

    const app = createApp();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 API: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  await getPrismaClient.$disconnect();
  process.exit(0);
});

startServer();
