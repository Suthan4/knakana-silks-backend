-- CreateEnum
CREATE TYPE "CourierPreference" AS ENUM ('CHEAPEST', 'FASTEST', 'CUSTOM');

-- AlterTable
ALTER TABLE "order_shipping_info" ADD COLUMN     "courierPreference" "CourierPreference",
ADD COLUMN     "selectedCourierCharge" DECIMAL(10,2),
ADD COLUMN     "selectedCourierCompanyId" INTEGER,
ADD COLUMN     "selectedCourierName" TEXT;
