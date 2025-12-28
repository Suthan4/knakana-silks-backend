/*
  Warnings:

  - A unique constraint covering the columns `[productId,variantId,warehouseId]` on the table `stocks` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "stocks_productId_key";

-- DropIndex
DROP INDEX "stocks_variantId_key";

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "warehouseId" BIGINT;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "stocks_warehouseId_idx" ON "stocks"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_productId_variantId_warehouseId_key" ON "stocks"("productId", "variantId", "warehouseId");

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
