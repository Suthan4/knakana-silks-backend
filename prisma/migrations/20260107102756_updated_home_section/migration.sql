-- CreateEnum
CREATE TYPE "CTAStyle" AS ENUM ('PRIMARY', 'SECONDARY', 'OUTLINE', 'TEXT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SectionType" ADD VALUE 'BEST_SELLERS';
ALTER TYPE "SectionType" ADD VALUE 'TRENDING';
ALTER TYPE "SectionType" ADD VALUE 'SEASONAL';
ALTER TYPE "SectionType" ADD VALUE 'CATEGORY_SPOTLIGHT';

-- AlterTable
ALTER TABLE "home_sections" ADD COLUMN     "backgroundColor" TEXT,
ADD COLUMN     "columns" INTEGER DEFAULT 4,
ADD COLUMN     "customTypeName" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "layout" TEXT DEFAULT 'grid',
ADD COLUMN     "showSubtitle" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showTitle" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "textColor" TEXT;

-- CreateTable
CREATE TABLE "section_media" (
    "id" BIGSERIAL NOT NULL,
    "sectionId" BIGINT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "altText" TEXT,
    "title" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "overlayTitle" TEXT,
    "overlaySubtitle" TEXT,
    "overlayPosition" TEXT DEFAULT 'center',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_ctas" (
    "id" BIGSERIAL NOT NULL,
    "sectionId" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "style" "CTAStyle" NOT NULL DEFAULT 'PRIMARY',
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "openNewTab" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_ctas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "section_media_sectionId_order_idx" ON "section_media"("sectionId", "order");

-- CreateIndex
CREATE INDEX "section_ctas_sectionId_order_idx" ON "section_ctas"("sectionId", "order");

-- AddForeignKey
ALTER TABLE "section_media" ADD CONSTRAINT "section_media_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "home_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_ctas" ADD CONSTRAINT "section_ctas_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "home_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
