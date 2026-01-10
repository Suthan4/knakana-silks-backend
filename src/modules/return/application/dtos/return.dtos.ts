import { z } from "zod";
import {
  ReturnReason,
  ReturnStatus,
  RefundMethod,
  MediaType,
} from "@/generated/prisma/enums.js";

// Media schema for returns
const ReturnMediaSchema = z.object({
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
  description: z.string().max(500).optional(),
});

// Create Return DTO
export const CreateReturnDTOSchema = z
  .object({
    orderId: z.string(),
    orderItems: z.array(
      z.object({
        orderItemId: z.string(),
        quantity: z.number().int().positive(),
        reason: z.nativeEnum(ReturnReason),
      })
    ),
    reasonDetails: z
      .string()
      .min(10, "Please provide detailed reason (minimum 10 characters)"),
    // Support for ReturnMedia
    media: z
      .array(ReturnMediaSchema)
      .min(1, "At least one media file is required")
      .max(10, "Maximum 10 media files allowed")
      .optional(),
    // Legacy images for backward compatibility
    images: z
      .array(z.string().url())
      .min(1, "At least one image is required")
      .max(5)
      .optional(),
    refundMethod: z
      .nativeEnum(RefundMethod)
      .default(RefundMethod.ORIGINAL_PAYMENT),
    bankDetails: z
      .object({
        accountHolderName: z.string().optional(),
        accountNumber: z.string().optional(),
        ifscCode: z.string().optional(),
        bankName: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // Either media or images must be provided
      return (
        (data.media && data.media.length > 0) ||
        (data.images && data.images.length > 0)
      );
    },
    {
      message: "Either media or images must be provided",
      path: ["media"],
    }
  );

export type CreateReturnDTO = z.infer<typeof CreateReturnDTOSchema>;

// Add Return Media DTO (for adding media to existing return)
export const AddReturnMediaDTOSchema = z.object({
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
  description: z.string().max(500).optional(),
});

export type AddReturnMediaDTO = z.infer<typeof AddReturnMediaDTOSchema>;

// Update Return Status DTO (Admin)
export const UpdateReturnStatusDTOSchema = z.object({
  status: z.nativeEnum(ReturnStatus),
  adminNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export type UpdateReturnStatusDTO = z.infer<typeof UpdateReturnStatusDTOSchema>;

// Query Return DTO
export const QueryReturnDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: z.nativeEnum(ReturnStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z
    .enum(["createdAt", "returnNumber", "refundAmount"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryReturnDTO = z.infer<typeof QueryReturnDTOSchema>;

// Schedule Return Pickup DTO
export const ScheduleReturnPickupDTOSchema = z.object({
  returnId: z.string(),
  pickupDate: z.string().datetime(),
});

export type ScheduleReturnPickupDTO = z.infer<
  typeof ScheduleReturnPickupDTOSchema
>;
