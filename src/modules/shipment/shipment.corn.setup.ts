import cron from "node-cron";
import { container } from "tsyringe";
import { ShipmentCronService } from "./application/service/shipment.corn.service.js";

/**
 * ✅ Setup cron jobs for shipment automation
 */
export function setupShipmentCronJobs() {
  const shipmentCronService = container.resolve(ShipmentCronService);

  // ✅ Run every 5 minutes to generate AWB and schedule pickup
  cron.schedule("*/5 * * * *", async () => {
    console.log("⏳ Running auto AWB scheduler...");
    try {
      await shipmentCronService.autoGenerateAwbForPendingOrders();
    } catch (error) {
      console.error("❌ Cron job failed:", error);
    }
  });

  console.log("✅ Shipment cron jobs initialized");
}