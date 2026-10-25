import { z } from "zod";

// ─── Status enum mirrors the Prisma DraftStatus enum ─────────────────────────

export const DraftStatusEnum = z.enum([
  "DRAFT",
  "VALIDATED",
  "MATCHING",
  "MATCHED",
  "READY_FOR_IMPORT",
  "IMPORTING",
  "IMPORTED",
  "COMPLETED",
  "FAILED",
]);

export type DraftStatus = z.infer<typeof DraftStatusEnum>;

// ─── Create Draft ─────────────────────────────────────────────────────────────

export const CreateBulkImportDraftSchema = z.object({
  rawInput: z.string().optional().default(""),
  parsedData: z.any().optional(),
  products: z.array(z.any()).optional(),
  imageMatches: z.any().optional(),
  confirmedAssignments: z.record(z.string(), z.string()).optional(),
  status: DraftStatusEnum.optional(),
});

export type CreateBulkImportDraftDto = z.infer<typeof CreateBulkImportDraftSchema>;

// ─── Update Draft ─────────────────────────────────────────────────────────────

export const UpdateBulkImportDraftSchema = z.object({
  rawInput: z.string().optional(),
  parsedData: z.any().optional(),
  products: z.array(z.any()).optional(),
  imageMatches: z.any().optional(),
  /** Admin-confirmed assignments: mediaIndex → driveFileId */
  confirmedAssignments: z.record(z.string(), z.string()).optional(),
  status: DraftStatusEnum.optional(),
});

export type UpdateBulkImportDraftDto = z.infer<typeof UpdateBulkImportDraftSchema>;

// ─── Match Drive Request ──────────────────────────────────────────────────────

export const MatchDriveSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
  /** Optional: force re-match even if user has confirmed some assignments. */
  forceRematch: z.boolean().optional().default(false),
});

export type MatchDriveDto = z.infer<typeof MatchDriveSchema>;

// ─── Response Shapes ──────────────────────────────────────────────────────────

export interface BulkImportDraftResponse {
  id: string;
  userId: string;
  rawInput: string;
  parsedData: any;
  imageMatches: any;
  confirmedAssignments: any;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sanitizes an arbitrary object/array so it can safely be stored in a Prisma Json column.
 * - Converts all BigInt values to strings.
 * - Removes keys with `undefined` values (which Prisma Json columns reject).
 * - Converts undefined or null root values to null.
 */
export function cleanPrismaJson<T = any>(val: any): T | null {
  if (val === undefined || val === null) return null;
  return JSON.parse(
    JSON.stringify(val, (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      return value;
    })
  );
}
