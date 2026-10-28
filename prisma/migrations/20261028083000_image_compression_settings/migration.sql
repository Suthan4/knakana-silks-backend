CREATE TABLE "image_compression_settings" (
    "id" BIGSERIAL NOT NULL,
    "uploadType" TEXT NOT NULL,
    "imgCompressionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imgQuality" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "image_compression_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "image_compression_settings_uploadType_key"
    ON "image_compression_settings"("uploadType");
