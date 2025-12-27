import { PrismaClient } from "@/generated/prisma/client.js";
import { registerAuthModule } from "@/modules/auth/container.js";
import { container } from "tsyringe";

export function setupContainer() {
  container.registerSingleton(PrismaClient);

  registerAuthModule();
//   registerProductModule();
//   registerOrderModule();
  console.log("🎉 All modules registered successfully");

}
