import { z } from "zod";
import { MediaType } from "@/generated/prisma/enums.js";

// Create Banner DTO
export const CreateBannerDTOSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE), // NEW
  url: z.string().url("Invalid media URL"), // UPDATED: Changed from 'image' to 'url'
  key: z.string().optional(), // NEW: R2 object key
  thumbnailUrl: z.string().url().optional(), // NEW: For video banners
  link: z.string().url().optional(),
  text: z.string().max(500).optional(),
  mimeType: z.string().optional(), // NEW
  fileSize: z.number().int().positive().optional(), // NEW
  duration: z.number().int().positive().optional(), // NEW: For videos
  width: z.number().int().positive().optional(), // NEW
  height: z.number().int().positive().optional(), // NEW
  isActive: z.boolean().default(true),
  order: z.number().int().default(0),
});

export type CreateBannerDTO = z.infer<typeof CreateBannerDTOSchema>;

// Update Banner DTO
export const UpdateBannerDTOSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.nativeEnum(MediaType).optional(), // NEW
  url: z.string().url().optional(), // UPDATED: Changed from 'image'
  key: z.string().optional(), // NEW
  thumbnailUrl: z.string().url().optional().nullable(), // NEW
  link: z.string().url().optional().nullable(),
  text: z.string().max(500).optional().nullable(),
  mimeType: z.string().optional(), // NEW
  fileSize: z.number().int().positive().optional(), // NEW
  duration: z.number().int().positive().optional(), // NEW
  width: z.number().int().positive().optional(), // NEW
  height: z.number().int().positive().optional(), // NEW
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
});

export type UpdateBannerDTO = z.infer<typeof UpdateBannerDTOSchema>;

// Query Banner DTO
export const QueryBannerDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  type: z.nativeEnum(MediaType).optional(), // NEW: Filter by media type
  isActive: z.boolean().optional(),
  sortBy: z.enum(["order", "createdAt", "title"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type QueryBannerDTO = z.infer<typeof QueryBannerDTOSchema>;
