import { z } from "zod";
import { RequestStatus } from "@/generated/prisma/enums.js";

export const CreateProductRequestDTOSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  customerNote: z.string().optional(),
});

export type CreateProductRequestDTO = z.infer<typeof CreateProductRequestDTOSchema>;

/**
 * Approval is a dedicated transition endpoint. Status is intentionally not
 * accepted from the client; the service owns the PENDING -> APPROVED transition.
 */
export const ApproveProductRequestDTOSchema = z.object({
  adminNote: z.string().trim().max(2000).optional(),
  // HTML date inputs are normalized to a full UTC ISO datetime by the admin API.
  estimatedAvailability: z.string().datetime().optional(),
});

export const RejectProductRequestDTOSchema = z.object({
  adminNote: z.string().trim().min(1, "Admin note is required").max(2000),
});

export const QueryProductRequestDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: z.nativeEnum(RequestStatus).optional(),
  sortBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryProductRequestDTO = z.infer<typeof QueryProductRequestDTOSchema>;
