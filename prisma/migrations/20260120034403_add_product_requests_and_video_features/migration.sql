/*
  Warnings:

  - A unique constraint covering the columns `[orderId]` on the table `consultations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "hasVideoConsultation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoConsultationNote" TEXT,
ADD COLUMN     "videoPurchasingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "consultation_configs" ADD COLUMN     "consultationDuration" INTEGER DEFAULT 30,
ADD COLUMN     "consultationNote" TEXT,
ADD COLUMN     "enableVideoConsultation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableVideoPurchasing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoPurchasingInstructions" TEXT;

-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "consultationNotes" TEXT,
ADD COLUMN     "isPurchaseConsultation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderId" BIGINT,
ADD COLUMN     "purchaseCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "allowOutOfStockOrders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasVideoConsultation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoConsultationNote" TEXT,
ADD COLUMN     "videoPurchasingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_requests" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "productId" BIGINT NOT NULL,
    "variantId" BIGINT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "customerNote" TEXT,
    "adminNote" TEXT,
    "notifyWhenAvailable" BOOLEAN NOT NULL DEFAULT true,
    "estimatedAvailability" TIMESTAMP(3),
    "requestNumber" TEXT NOT NULL,
    "orderId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_requests_requestNumber_key" ON "product_requests"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_requests_orderId_key" ON "product_requests"("orderId");

-- CreateIndex
CREATE INDEX "product_requests_userId_idx" ON "product_requests"("userId");

-- CreateIndex
CREATE INDEX "product_requests_productId_idx" ON "product_requests"("productId");

-- CreateIndex
CREATE INDEX "product_requests_status_idx" ON "product_requests"("status");

-- CreateIndex
CREATE INDEX "product_requests_requestNumber_idx" ON "product_requests"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_orderId_key" ON "consultations"("orderId");

-- CreateIndex
CREATE INDEX "consultations_isPurchaseConsultation_idx" ON "consultations"("isPurchaseConsultation");

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
