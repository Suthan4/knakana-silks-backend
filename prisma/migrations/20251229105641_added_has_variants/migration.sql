/*
  Warnings:

  - Added the required column `hasVariants` to the `products` table without a default value. This is not possible if the table is not empty.
  - Made the column `productId` on table `stocks` required. This step will fail if there are existing NULL values in that column.
  - Made the column `warehouseId` on table `stocks` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "hasVariants" BOOLEAN NOT NULL;

-- AlterTable
ALTER TABLE "stocks" ALTER COLUMN "productId" SET NOT NULL,
ALTER COLUMN "warehouseId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "products_hasVariants_idx" ON "products"("hasVariants");
