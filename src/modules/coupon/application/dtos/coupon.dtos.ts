import { z } from "zod";
import { DiscountType } from "@/generated/prisma/enums.js";

// Create Coupon DTO
export const CreateCouponDTOSchema = z
  .object({
    code: z
      .string()
      .min(3, "Code must be at least 3 characters")
      .max(20)
      .toUpperCase(),
    description: z.string().optional(),
    discountType: z.nativeEnum(DiscountType),
    discountValue: z.number().positive("Discount value must be positive"),
    minOrderValue: z.number().min(0).default(0),
    maxUsage: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    validFrom: z.string().datetime(),
    validUntil: z.string().datetime(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      const validFrom = new Date(data.validFrom);
      const validUntil = new Date(data.validUntil);
      return validFrom < validUntil;
    },
    {
      message: "validFrom must be before validUntil",
      path: ["validUntil"],
    }
  );

export type CreateCouponDTO = z.infer<typeof CreateCouponDTOSchema>;

// Update Coupon DTO
export const UpdateCouponDTOSchema = z.object({
  description: z.string().optional(),
  discountType: z.nativeEnum(DiscountType).optional(),
  discountValue: z.number().positive().optional(),
  minOrderValue: z.number().min(0).optional(),
  maxUsage: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCouponDTO = z.infer<typeof UpdateCouponDTOSchema>;

// Apply Coupon DTO
export const ApplyCouponDTOSchema = z.object({
  code: z.string(),
  orderAmount: z.number().positive(),
});

export type ApplyCouponDTO = z.infer<typeof ApplyCouponDTOSchema>;

// Query Coupon DTO
export const QueryCouponDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  isActive: z.boolean().optional(),
  sortBy: z.enum(["code", "createdAt", "validUntil"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryCouponDTO = z.infer<typeof QueryCouponDTOSchema>;
