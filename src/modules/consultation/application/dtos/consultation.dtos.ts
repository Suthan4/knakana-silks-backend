import { z } from "zod";
import {
  ConsultationPlatform,
  ConsultationStatus,
} from "@/generated/prisma/enums.js";

// Create Consultation DTO
export const CreateConsultationDTOSchema = z
  .object({
    productId: z.string().optional(),
    categoryId: z.string().optional(),
    platform: z.nativeEnum(ConsultationPlatform),
    preferredDate: z.string().datetime(),
    preferredTime: z
      .string()
      .regex(
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Invalid time format (HH:MM)"
      ),
      // Add after preferredTime:
isPurchaseConsultation: z.boolean().optional().default(false),
consultationNotes: z.string().optional(),
  })
  .refine((data) => data.productId || data.categoryId, {
    message: "Either productId or categoryId must be provided",
  });

export type CreateConsultationDTO = z.infer<typeof CreateConsultationDTOSchema>;

// Update Consultation Status DTO
export const UpdateConsultationStatusDTOSchema = z.object({
  status: z.nativeEnum(ConsultationStatus),
  meetingLink: z.string().url().optional(),
  rejectionReason: z.string().optional(),
});

export type UpdateConsultationStatusDTO = z.infer<
  typeof UpdateConsultationStatusDTOSchema
>;

// Query Consultation DTO
export const QueryConsultationDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: z.nativeEnum(ConsultationStatus).optional(),
  platform: z.nativeEnum(ConsultationPlatform).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["preferredDate", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryConsultationDTO = z.infer<typeof QueryConsultationDTOSchema>;
