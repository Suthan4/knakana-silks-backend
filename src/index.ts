import "dotenv/config";
import { getPrismaClient } from "./lib/database/prisma.js";
import { createApp } from "./app.js";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await getPrismaClient.$connect();
    console.log("✅ Database connected");

    const app = createApp();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 API: http://localhost:${PORT}`);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use. Please:`);
        console.error(
          `   1. Kill the process using: netstat -ano | findstr :${PORT}`
        );
        console.error(`   2. Or change PORT in .env file`);
        process.exit(1);
      } else {
        throw error;
      }
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
