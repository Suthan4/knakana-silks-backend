import { z } from "zod";

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
  images: z.array(z.string().url()).max(5).optional(),
});

export type UpdateReviewDTO = z.infer<typeof UpdateReviewDTOSchema>;

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
