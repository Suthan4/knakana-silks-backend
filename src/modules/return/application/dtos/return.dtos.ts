import { z } from "zod";
import {
  ReturnReason,
  ReturnStatus,
  RefundMethod,
} from "@/generated/prisma/enums.js";

// Create Return DTO
export const CreateReturnDTOSchema = z.object({
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
  images: z
    .array(z.string().url())
    .min(1, "At least one image is required")
    .max(5),
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
});

export type CreateReturnDTO = z.infer<typeof CreateReturnDTOSchema>;

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
