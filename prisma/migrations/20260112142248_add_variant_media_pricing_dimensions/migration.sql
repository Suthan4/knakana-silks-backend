-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "basePrice" DECIMAL(10,2),
ADD COLUMN     "breadth" DECIMAL(8,2),
ADD COLUMN     "height" DECIMAL(8,2),
ADD COLUMN     "length" DECIMAL(8,2),
ADD COLUMN     "sellingPrice" DECIMAL(10,2),
ADD COLUMN     "volumetricWeight" DECIMAL(8,3),
ADD COLUMN     "weight" DECIMAL(8,3);

-- CreateTable
CREATE TABLE "product_variant_media" (
    "id" BIGSERIAL NOT NULL,
    "variantId" BIGINT NOT NULL,
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

    CONSTRAINT "product_variant_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variant_media_variantId_idx" ON "product_variant_media"("variantId");

-- CreateIndex
CREATE INDEX "product_variant_media_type_idx" ON "product_variant_media"("type");

-- CreateIndex
CREATE INDEX "product_variant_media_isActive_idx" ON "product_variant_media"("isActive");

-- AddForeignKey
ALTER TABLE "product_variant_media" ADD CONSTRAINT "product_variant_media_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
