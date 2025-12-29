import { z } from "zod";

// Create Banner DTO
export const CreateBannerDTOSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  image: z.string().url("Invalid image URL"),
  link: z.string().url().optional(),
  text: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  order: z.number().int().default(0),
});

export type CreateBannerDTO = z.infer<typeof CreateBannerDTOSchema>;

// Update Banner DTO
export const UpdateBannerDTOSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  image: z.string().url().optional(),
  link: z.string().url().optional().nullable(),
  text: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
});

export type UpdateBannerDTO = z.infer<typeof UpdateBannerDTOSchema>;

// Query Banner DTO
export const QueryBannerDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  isActive: z.boolean().optional(),
  sortBy: z.enum(["order", "createdAt", "title"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryBannerDTO = z.infer<typeof QueryBannerDTOSchema>;
