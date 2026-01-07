/*
  Warnings:

  - You are about to drop the column `image` on the `banners` table. All the data in the column will be lost.
  - You are about to drop the `product_images` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `url` to the `banners` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER');

-- DropForeignKey
ALTER TABLE "product_images" DROP CONSTRAINT "product_images_productId_fkey";

-- AlterTable
ALTER TABLE "banners" DROP COLUMN "image",
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "fileSize" BIGINT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
ADD COLUMN     "url" TEXT NOT NULL,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "product_images";

-- CreateTable
CREATE TABLE "product_media" (
    "id" BIGSERIAL NOT NULL,
    "productId" BIGINT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "key" TEXT,
    "thumbnailUrl" TEXT,
    "altText" TEXT,
    "title" TEXT,
    "description" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_media" (
    "id" BIGSERIAL NOT NULL,
    "reviewId" BIGINT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "key" TEXT,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_media" (
    "id" BIGSERIAL NOT NULL,
    "returnId" BIGINT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "key" TEXT,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_media_productId_idx" ON "product_media"("productId");

-- CreateIndex
CREATE INDEX "product_media_type_idx" ON "product_media"("type");

-- CreateIndex
CREATE INDEX "product_media_isActive_idx" ON "product_media"("isActive");

-- CreateIndex
CREATE INDEX "review_media_reviewId_idx" ON "review_media"("reviewId");

-- CreateIndex
CREATE INDEX "review_media_type_idx" ON "review_media"("type");

-- CreateIndex
CREATE INDEX "return_media_returnId_idx" ON "return_media"("returnId");

-- CreateIndex
CREATE INDEX "return_media_type_idx" ON "return_media"("type");

-- CreateIndex
CREATE INDEX "banners_isActive_order_idx" ON "banners"("isActive", "order");

-- CreateIndex
CREATE INDEX "banners_type_idx" ON "banners"("type");

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_media" ADD CONSTRAINT "return_media_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
