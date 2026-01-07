import { z } from "zod";
import { MediaType } from "@/generated/prisma/enums.js";

// UPDATED: Media schema for reviews
const ReviewMediaSchema = z.object({
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE),
  url: z.string().url("Invalid media URL"),
  key: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional().default(0),
});

// Create Review DTO
export const CreateReviewDTOSchema = z.object({
  productId: z.string(),
  orderId: z.string().optional(),
  rating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating cannot exceed 5"),
  comment: z
    .string()
    .min(10, "Review must be at least 10 characters")
    .max(1000)
    .optional(),
  // UPDATED: Support for ReviewMedia
  media: z
    .array(ReviewMediaSchema)
    .max(5, "Maximum 5 media files allowed")
    .optional(),
  // Keep legacy images for backward compatibility
  images: z
    .array(z.string().url())
    .max(5, "Maximum 5 images allowed")
    .optional(),
});

export type CreateReviewDTO = z.infer<typeof CreateReviewDTOSchema>;

// Update Review DTO
export const UpdateReviewDTOSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().min(10).max(1000).optional(),
  media: z.array(ReviewMediaSchema).max(5).optional(),
  images: z.array(z.string().url()).max(5).optional(),
});

export type UpdateReviewDTO = z.infer<typeof UpdateReviewDTOSchema>;

// Add Media DTO (for adding media to existing review)
export const AddReviewMediaDTOSchema = z.object({
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE),
  url: z.string().url("Invalid media URL"),
  key: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional().default(0),
});

export type AddReviewMediaDTO = z.infer<typeof AddReviewMediaDTOSchema>;

// Query Review DTO
export const QueryReviewDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  productId: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  isApproved: z.boolean().optional(),
  isVerifiedPurchase: z.boolean().optional(),
  sortBy: z.enum(["createdAt", "rating", "helpfulCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryReviewDTO = z.infer<typeof QueryReviewDTOSchema>;

// Approve Review DTO (Admin)
export const ApproveReviewDTOSchema = z.object({
  isApproved: z.boolean(),
});

export type ApproveReviewDTO = z.infer<typeof ApproveReviewDTOSchema>;
