-- Store provider tracking states for forward shipments.
ALTER TABLE "shipments"
  ADD COLUMN "shiprocketStatus" TEXT,
  ADD COLUMN "shiprocketStatusId" INTEGER,
  ADD COLUMN "statusUpdatedAt" TIMESTAMP(3);

-- Earlier code stored Shiprocket shipment_id in the "awb" column on
-- return_shipments. Move it into a correctly named column and allow a true
-- AWB to remain NULL until Shiprocket assigns one.
ALTER TABLE "return_shipments"
  ADD COLUMN "shiprocketShipmentId" TEXT;

UPDATE "return_shipments"
SET "shiprocketShipmentId" = "awb"
WHERE "awb" IS NOT NULL;

UPDATE "return_shipments"
SET "awb" = NULL
WHERE "awb" IS NOT NULL;

ALTER TABLE "return_shipments"
  ALTER COLUMN "awb" DROP NOT NULL;

CREATE UNIQUE INDEX "return_shipments_shiprocketShipmentId_key"
  ON "return_shipments"("shiprocketShipmentId");
