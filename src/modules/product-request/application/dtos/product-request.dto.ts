import { z } from "zod";
import { RequestStatus } from "@/generated/prisma/enums.js";

export const CreateProductRequestDTOSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  customerNote: z.string().optional(),
});

export type CreateProductRequestDTO = z.infer<typeof CreateProductRequestDTOSchema>;

export const UpdateProductRequestDTOSchema = z.object({
  status: z.nativeEnum(RequestStatus),
  adminNote: z.string().optional(),
  estimatedAvailability: z.string().datetime().optional(),
});

export type UpdateProductRequestDTO = z.infer<typeof UpdateProductRequestDTOSchema>;

export const QueryProductRequestDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: z.nativeEnum(RequestStatus).optional(),
  sortBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryProductRequestDTO = z.infer<typeof QueryProductRequestDTOSchema>;