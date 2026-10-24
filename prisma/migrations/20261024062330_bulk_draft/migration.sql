-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'READY_FOR_IMPORT', 'FAILED', 'COMPLETED');

-- CreateTable
CREATE TABLE "DriveOAuth" (
    "userId" BIGINT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveOAuth_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "BulkImportDraft" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "parsedData" JSONB,
    "imageMatches" JSONB,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveOAuth_userId_key" ON "DriveOAuth"("userId");

-- CreateIndex
CREATE INDEX "BulkImportDraft_userId_idx" ON "BulkImportDraft"("userId");

-- AddForeignKey
ALTER TABLE "DriveOAuth" ADD CONSTRAINT "DriveOAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkImportDraft" ADD CONSTRAINT "BulkImportDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
