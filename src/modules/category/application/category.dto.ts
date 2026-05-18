import { z } from "zod";

// Create Category DTO
export const CreateCategoryDTOSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  parentId: z.string().optional(),
metaTitle: z
  .string()
  .max(70, "Meta title must be less than 70 characters")
  .optional(),

metaDesc: z
  .string()
  .max(160, "Meta description must be less than 160 characters")
  .optional(),
  image: z
  .string()
  .refine(
    (value) =>
      value === "" ||
      value.startsWith("data:image/") ||
      value.startsWith("http"),
    {
      message: "Only JPG, PNG, WEBP images are allowed",
    }
  )
  .optional(),
  isActive: z.boolean().default(true),
  order: z.number().int().default(0),
  // Add after order field:
hasVideoConsultation: z.boolean().optional().default(false),
videoPurchasingEnabled: z.boolean().optional().default(false),
videoConsultationNote: z.string().optional(),
});

export type CreateCategoryDTO = z.infer<typeof CreateCategoryDTOSchema>;

// Update Category DTO
export const UpdateCategoryDTOSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  parentId: z.string().nullable().optional(),
metaTitle: z
  .string()
  .max(70, "Meta title must be less than 70 characters")
  .optional(),

metaDesc: z
  .string()
  .max(160, "Meta description must be less than 160 characters")
  .optional(),
  image: z
  .string()
  .refine(
    (value) =>
      value === "" ||
      value.startsWith("data:image/") ||
      value.startsWith("http"),
    {
      message: "Only JPG, PNG, WEBP images are allowed",
    }
  )
  .optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
  // Add after order field:
hasVideoConsultation: z.boolean().optional().default(false),
videoPurchasingEnabled: z.boolean().optional().default(false),
videoConsultationNote: z.string().optional(),
});

export type UpdateCategoryDTO = z.infer<typeof UpdateCategoryDTOSchema>;

// Query Category DTO
export const QueryCategoryDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().optional(),
  sortBy: z.enum(["name", "createdAt", "order"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryCategoryDTO = z.infer<typeof QueryCategoryDTOSchema>;
