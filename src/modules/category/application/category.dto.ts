import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Shared field definitions (DRY)
// ─────────────────────────────────────────────────────────────────────────────

const nameField = z.string().min(1, "Name is required").max(100);

const metaTitleField = z
  .string()
  .max(70, "Meta title must be less than 70 characters")
  .optional();

const metaDescField = z
  .string()
  .max(160, "Meta description must be less than 160 characters")
  .optional();

const imageField = z
  .string()
  .refine(
    (v) => v === "" || v.startsWith("data:image/") || v.startsWith("http"),
    { message: "Only JPG, PNG, WEBP images are allowed" }
  )
  .optional();

const videoFields = {
  hasVideoConsultation:   z.boolean().optional().default(false),
  videoPurchasingEnabled: z.boolean().optional().default(false),
  videoConsultationNote:  z.string().optional(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export const CreateCategoryDTOSchema = z.object({
  name:        nameField,
  description: z.string().optional(),
  /** If provided, a CategoryPlacement is created linking the new category under this parent. */
  parentId: z.string().optional(),
  /** Explicitly mark as a root/top-level entry (e.g. "Sarees", "Weddings"). Ignored if parentId is set. */
  isRoot: z.boolean().optional().default(false),
  metaTitle:   metaTitleField,
  metaDesc:    metaDescField,
  image:       imageField,
  isActive:    z.boolean().default(true),
  order:       z.number().int().default(0),
  ...videoFields,
});

export type CreateCategoryDTO = z.infer<typeof CreateCategoryDTOSchema>;

// ── Link an EXISTING category under a (possibly different) parent ─────────
export const LinkCategoryDTOSchema = z.object({
  parentId: z.string().min(1, "Parent ID is required"),
  childId: z.string().min(1, "Category to link is required"),
  order: z.number().int().default(0),
});
export type LinkCategoryDTO = z.infer<typeof LinkCategoryDTOSchema>;

// ── Update placement order/position under a given parent ─────────────────
export const UpdatePlacementDTOSchema = z.object({
  order: z.number().int(),
});
export type UpdatePlacementDTO = z.infer<typeof UpdatePlacementDTOSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateCategoryDTOSchema = z.object({
  name:        nameField.optional(),
  description: z.string().optional(),
  isRoot: z.boolean().optional(),
  metaTitle:   metaTitleField,
  metaDesc:    metaDescField,
  image:       imageField,
  isActive:    z.boolean().optional(),
  order:       z.number().int().optional(),
  ...videoFields,
});

export type UpdateCategoryDTO = z.infer<typeof UpdateCategoryDTOSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────────────

export const QueryCategoryDTOSchema = z.object({
  page:      z.number().int().positive().default(1),
  limit:     z.number().int().positive().max(100).default(10),
  search:    z.string().optional(),
  isActive:  z.boolean().optional(),
  isRoot:  z.boolean().optional(),
  sortBy:    z.enum(["name", "createdAt", "order"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryCategoryDTO = z.infer<typeof QueryCategoryDTOSchema>;