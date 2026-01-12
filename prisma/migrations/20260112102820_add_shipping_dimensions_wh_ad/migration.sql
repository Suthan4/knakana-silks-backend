-- AlterTable
ALTER TABLE "products" ADD COLUMN     "breadth" DECIMAL(8,2),
ADD COLUMN     "height" DECIMAL(8,2),
ADD COLUMN     "length" DECIMAL(8,2),
ADD COLUMN     "volumetricWeight" DECIMAL(8,3),
ADD COLUMN     "weight" DECIMAL(8,3);

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'India',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "isDefaultPickup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT;
