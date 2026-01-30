import { z } from "zod";
import { SectionType, MediaType, CTAStyle } from "@/generated/prisma/enums.js";

// Media DTO
export const SectionMediaDTOSchema = z.object({
  type: z.nativeEnum(MediaType),
  url: z.string().url("Invalid media URL"),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().optional(),
  title: z.string().optional(),
  order: z.number().int().default(0),
  overlayTitle: z.string().optional(),
  overlaySubtitle: z.string().optional(),
  overlayPosition: z
    .enum(["center", "left", "right", "top", "bottom"])
    .default("center"),
});

export type SectionMediaDTO = z.infer<typeof SectionMediaDTOSchema>;

// CTA Button DTO
export const SectionCTADTOSchema = z.object({
  text: z.string().min(1, "Button text is required").max(50),
  url: z
    .string()
    .url("Invalid URL")
    .or(z.string().regex(/^\//, "Must be a valid URL or path")),
  style: z.nativeEnum(CTAStyle).default(CTAStyle.PRIMARY),
  icon: z.string().optional(),
  order: z.number().int().default(0),
  openNewTab: z.boolean().default(false),
});

export type SectionCTADTO = z.infer<typeof SectionCTADTOSchema>;

// Create HomeSection DTO
export const CreateHomeSectionDTOSchema = z
  .object({
    // Basic Info
    type: z.nativeEnum(SectionType),
    title: z.string().min(1, "Title is required").max(200),
    subtitle: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
    customTypeName: z.string().min(1).max(100).optional(),

    // Layout & Styling
    backgroundColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
      .optional(),
    textColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
      .optional(),
    layout: z.enum(["grid", "carousel", "list", "banner", "aesthetic-fullscreen"]).default("grid"),
    columns: z.number().int().min(1).max(12).default(4),

    // Display Settings
    isActive: z.boolean().default(true),
    order: z.number().int().default(0),
    limit: z.number().int().positive().default(8),
    showTitle: z.boolean().default(true),
    showSubtitle: z.boolean().default(true),

    // Relations
    productIds: z.array(z.string()).optional(),
    categoryIds: z.array(z.string()).optional(),
    media: z.array(SectionMediaDTOSchema).optional(),
    ctaButtons: z.array(SectionCTADTOSchema).optional(),
  })
  .refine(
    (data) => {
      // If type is CUSTOM, customTypeName is required
      if (data.type === SectionType.CUSTOM) {
        return !!data.customTypeName && data.customTypeName.length > 0;
      }
      return true;
    },
    {
      message: "Custom type name is required when type is CUSTOM",
      path: ["customTypeName"],
    }
  )
  .refine(
    (data) => {
      // If type is HERO_SLIDER, at least one media is required
      if (data.type === SectionType.HERO_SLIDER) {
        return data.media && data.media.length > 0;
      }
      return true;
    },
    {
      message: "At least one media item is required for Hero Slider",
      path: ["media"],
    }
  );

export type CreateHomeSectionDTO = z.infer<typeof CreateHomeSectionDTOSchema>;

// Update HomeSection DTO
export const UpdateHomeSectionDTOSchema = z
  .object({
    // Basic Info
    type: z.nativeEnum(SectionType).optional(),
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(500).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    customTypeName: z.string().min(1).max(100).optional().nullable(),

    // Layout & Styling
    backgroundColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable(),
    textColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable(),
    layout: z.enum(["grid", "carousel", "list", "banner","aesthetic-fullscreen"]).optional(),
    columns: z.number().int().min(1).max(12).optional(),

    // Display Settings
    isActive: z.boolean().optional(),
    order: z.number().int().optional(),
    limit: z.number().int().positive().optional(),
    showTitle: z.boolean().optional(),
    showSubtitle: z.boolean().optional(),

    // Relations
    productIds: z.array(z.string()).optional(),
    categoryIds: z.array(z.string()).optional(),
    media: z.array(SectionMediaDTOSchema).optional(),
    ctaButtons: z.array(SectionCTADTOSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.type === SectionType.CUSTOM) {
        return !!data.customTypeName && data.customTypeName.length > 0;
      }
      return true;
    },
    {
      message: "Custom type name is required when type is CUSTOM",
      path: ["customTypeName"],
    }
  );

export type UpdateHomeSectionDTO = z.infer<typeof UpdateHomeSectionDTOSchema>;

// Query HomeSection DTO (unchanged)
export const QueryHomeSectionDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  isActive: z.boolean().optional(),
  type: z.nativeEnum(SectionType).optional(),
  sortBy: z.enum(["order", "createdAt", "title"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryHomeSectionDTO = z.infer<typeof QueryHomeSectionDTOSchema>;
