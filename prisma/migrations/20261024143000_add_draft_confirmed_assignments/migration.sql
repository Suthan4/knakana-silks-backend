-- AlterTable
ALTER TABLE "BulkImportDraft" ADD COLUMN IF NOT EXISTS "confirmedAssignments" JSONB;

