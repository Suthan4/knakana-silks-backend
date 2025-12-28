-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('HERO_SLIDER', 'NEW_ARRIVALS', 'FEATURED', 'COLLECTIONS', 'CATEGORIES', 'CUSTOM');

-- CreateTable
CREATE TABLE "home_sections" (
    "id" BIGSERIAL NOT NULL,
    "type" "SectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SectionCategories" (
    "A" BIGINT NOT NULL,
    "B" BIGINT NOT NULL,

    CONSTRAINT "_SectionCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SectionProducts" (
    "A" BIGINT NOT NULL,
    "B" BIGINT NOT NULL,

    CONSTRAINT "_SectionProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "home_sections_isActive_order_idx" ON "home_sections"("isActive", "order");

-- CreateIndex
CREATE INDEX "_SectionCategories_B_index" ON "_SectionCategories"("B");

-- CreateIndex
CREATE INDEX "_SectionProducts_B_index" ON "_SectionProducts"("B");

-- AddForeignKey
ALTER TABLE "_SectionCategories" ADD CONSTRAINT "_SectionCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SectionCategories" ADD CONSTRAINT "_SectionCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "home_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SectionProducts" ADD CONSTRAINT "_SectionProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "home_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SectionProducts" ADD CONSTRAINT "_SectionProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
