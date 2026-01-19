-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "gstAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "orders_couponId_idx" ON "orders"("couponId");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
