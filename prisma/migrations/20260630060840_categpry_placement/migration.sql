-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_parentId_fkey";

-- DropIndex
DROP INDEX "categories_parentId_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "isRoot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "category_placements" (
    "id" BIGSERIAL NOT NULL,
    "parentId" BIGINT NOT NULL,
    "childId" BIGINT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_placements_parentId_idx" ON "category_placements"("parentId");

-- CreateIndex
CREATE INDEX "category_placements_childId_idx" ON "category_placements"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "category_placements_parentId_childId_key" ON "category_placements"("parentId", "childId");

-- CreateIndex
CREATE INDEX "categories_isRoot_idx" ON "categories"("isRoot");

-- AddForeignKey
ALTER TABLE "category_placements" ADD CONSTRAINT "category_placements_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_placements" ADD CONSTRAINT "category_placements_childId_fkey" FOREIGN KEY ("childId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
