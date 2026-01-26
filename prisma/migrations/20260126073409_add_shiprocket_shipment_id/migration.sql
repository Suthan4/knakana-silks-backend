/*
  Warnings:

  - A unique constraint covering the columns `[shiprocketShipmentId]` on the table `shipments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "awbCode" TEXT,
ADD COLUMN     "courierCompanyId" INTEGER,
ADD COLUMN     "shiprocketShipmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shiprocketShipmentId_key" ON "shipments"("shiprocketShipmentId");

-- CreateIndex
CREATE INDEX "shipments_awbCode_idx" ON "shipments"("awbCode");
