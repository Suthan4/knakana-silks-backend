import { z } from "zod";
import { SectionType } from "@/generated/prisma/enums.js";

// Create HomeSection DTO
export const CreateHomeSectionDTOSchema = z.object({
  type: z.nativeEnum(SectionType),
  title: z.string().min(1, "Title is required").max(200),
  subtitle: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  order: z.number().int().default(0),
  limit: z.number().int().positive().default(8),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
});

export type CreateHomeSectionDTO = z.infer<typeof CreateHomeSectionDTOSchema>;

// Update HomeSection DTO
export const UpdateHomeSectionDTOSchema = z.object({
  type: z.nativeEnum(SectionType).optional(),
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
  limit: z.number().int().positive().optional(),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
});

export type UpdateHomeSectionDTO = z.infer<typeof UpdateHomeSectionDTOSchema>;

// Query HomeSection DTO
export const QueryHomeSectionDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  isActive: z.boolean().optional(),
  type: z.nativeEnum(SectionType).optional(),
  sortBy: z.enum(["order", "createdAt", "title"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryHomeSectionDTO = z.infer<typeof QueryHomeSectionDTOSchema>;
