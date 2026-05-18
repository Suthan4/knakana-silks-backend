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
  /**
   * parentId is optional.  When provided the service will scope the slug as
   * "<parent-slug>-<name-slug>" so duplicate names across different parents
   * never collide (e.g. root "Sarees" → "sarees", "What's New > Sarees" → "whats-new-sarees").
   */
  parentId:    z.string().optional(),
  metaTitle:   metaTitleField,
  metaDesc:    metaDescField,
  image:       imageField,
  isActive:    z.boolean().default(true),
  order:       z.number().int().default(0),
  ...videoFields,
});

export type CreateCategoryDTO = z.infer<typeof CreateCategoryDTOSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateCategoryDTOSchema = z.object({
  name:        nameField.optional(),
  description: z.string().optional(),
  /**
   * parentId can be:
   *   - undefined  → don't change the parent
   *   - null       → move to root (no parent)
   *   - "123"      → reparent to category with id 123
   *
   * The service re-computes the slug whenever name OR parentId changes.
   */
  parentId:    z.string().nullable().optional(),
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
  parentId:  z.string().optional(),
  sortBy:    z.enum(["name", "createdAt", "order"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryCategoryDTO = z.infer<typeof QueryCategoryDTOSchema>;