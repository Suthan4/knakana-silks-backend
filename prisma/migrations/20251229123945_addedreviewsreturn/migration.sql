/*
  Warnings:

  - The values [REQUESTED,COMPLETED] on the enum `ReturnStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `approvedBy` on the `returns` table. All the data in the column will be lost.
  - You are about to drop the column `refundType` on the `returns` table. All the data in the column will be lost.
  - You are about to alter the column `refundAmount` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - You are about to drop the `review_images` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[returnNumber]` on the table `returns` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[returnShipmentId]` on the table `returns` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `reasonDetails` to the `returns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `returnNumber` to the `returns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `returns` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `reason` on the `returns` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DEFECTIVE', 'WRONG_ITEM', 'SIZE_ISSUE', 'COLOR_DIFFERENCE', 'QUALITY_ISSUE', 'NOT_AS_DESCRIBED', 'DAMAGED_IN_TRANSIT', 'CHANGED_MIND', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('ORIGINAL_PAYMENT', 'STORE_CREDIT', 'BANK_TRANSFER');

-- AlterEnum
BEGIN;
CREATE TYPE "ReturnStatus_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'REFUND_INITIATED', 'REFUND_COMPLETED', 'CLOSED');
ALTER TABLE "public"."returns" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "returns" ALTER COLUMN "status" TYPE "ReturnStatus_new" USING ("status"::text::"ReturnStatus_new");
ALTER TYPE "ReturnStatus" RENAME TO "ReturnStatus_old";
ALTER TYPE "ReturnStatus_new" RENAME TO "ReturnStatus";
DROP TYPE "public"."ReturnStatus_old";
ALTER TABLE "returns" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "review_images" DROP CONSTRAINT "review_images_reviewId_fkey";

-- DropIndex
DROP INDEX "returns_orderId_key";

-- DropIndex
DROP INDEX "reviews_productId_idx";

-- AlterTable
ALTER TABLE "returns" DROP COLUMN "approvedBy",
DROP COLUMN "refundType",
ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "bankDetails" JSONB,
ADD COLUMN     "images" TEXT[],
ADD COLUMN     "razorpayRefundId" TEXT,
ADD COLUMN     "reasonDetails" TEXT NOT NULL,
ADD COLUMN     "refundMethod" "RefundMethod" NOT NULL DEFAULT 'ORIGINAL_PAYMENT',
ADD COLUMN     "returnNumber" TEXT NOT NULL,
ADD COLUMN     "returnShipmentId" BIGINT,
ADD COLUMN     "userId" BIGINT NOT NULL,
DROP COLUMN "reason",
ADD COLUMN     "reason" "ReturnReason" NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "refundAmount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "images" TEXT[],
ADD COLUMN     "orderId" BIGINT;

-- DropTable
DROP TABLE "review_images";

-- CreateTable
CREATE TABLE "review_helpful_votes" (
    "id" BIGSERIAL NOT NULL,
    "reviewId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" BIGSERIAL NOT NULL,
    "returnId" BIGINT NOT NULL,
    "orderItemId" BIGINT NOT NULL,
    "productId" BIGINT NOT NULL,
    "variantId" BIGINT,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_shipments" (
    "id" BIGSERIAL NOT NULL,
    "shiprocketOrderId" TEXT NOT NULL,
    "awb" TEXT NOT NULL,
    "courierName" TEXT NOT NULL,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "trackingUrl" TEXT,
    "status" TEXT NOT NULL,
    "currentLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_helpful_votes_reviewId_userId_key" ON "review_helpful_votes"("reviewId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_orderItemId_key" ON "return_items"("orderItemId");

-- CreateIndex
CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "return_shipments_shiprocketOrderId_key" ON "return_shipments"("shiprocketOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "return_shipments_awb_key" ON "return_shipments"("awb");

-- CreateIndex
CREATE INDEX "return_shipments_awb_idx" ON "return_shipments"("awb");

-- CreateIndex
CREATE UNIQUE INDEX "returns_returnNumber_key" ON "returns"("returnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "returns_returnShipmentId_key" ON "returns"("returnShipmentId");

-- CreateIndex
CREATE INDEX "returns_userId_idx" ON "returns"("userId");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "returns_returnNumber_idx" ON "returns"("returnNumber");

-- CreateIndex
CREATE INDEX "reviews_productId_isApproved_idx" ON "reviews"("productId", "isApproved");

-- CreateIndex
CREATE INDEX "reviews_rating_idx" ON "reviews"("rating");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_returnShipmentId_fkey" FOREIGN KEY ("returnShipmentId") REFERENCES "return_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
