import bcrypt from "bcrypt";
import {getPrismaClient} from "../src/lib/database/prisma"

async function main() {
  console.log("🌱 Starting seed...");
  const prisma = getPrismaClient;

  // Create Super Admin
  const hashedPassword = await bcrypt.hash("SuperAdmin123!", 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@kanganasilks.com" },
    update: {},
    create: {
      email: "superadmin@kanganasilks.com",
      password: hashedPassword,
      firstName: "Super",
      lastName: "Admin",
      phone: "9999999999",
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerified: true,
    },
  });

  console.log("✅ Super Admin created:");
  console.log("   Email: superadmin@kanganasilks.com");
  console.log("   Password: SuperAdmin123!");
  console.log("   ID:", superAdmin.id.toString());

  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrismaClient.$disconnect();
  });
