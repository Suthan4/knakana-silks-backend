import { z } from "zod";
import { DiscountType } from "@/generated/prisma/enums.js";

// Enums (should match Prisma schema)
export enum CouponScope {
  ALL = "ALL",
  CATEGORY = "CATEGORY",
  PRODUCT = "PRODUCT",
}

export enum CouponUserEligibility {
  ALL = "ALL",
  SPECIFIC_USERS = "SPECIFIC_USERS",
  FIRST_TIME = "FIRST_TIME",
  NEW_USERS = "NEW_USERS",
}

// Create Coupon DTO - ENHANCED
export const CreateCouponDTOSchema = z
  .object({
    // Basic Info
    code: z
      .string()
      .min(3, "Code must be at least 3 characters")
      .max(20)
      .toUpperCase(),
    description: z.string().optional(),
    
    // Discount Settings
    discountType: z.nativeEnum(DiscountType),
    discountValue: z.number().positive("Discount value must be positive"),
    minOrderValue: z.number().min(0).default(0),
    maxDiscountAmount: z.number().positive().optional(), // 🆕 NEW
    
    // 🆕 NEW: Scope Management
    scope: z.nativeEnum(CouponScope).default(CouponScope.ALL),
    categoryIds: z.array(z.string()).optional(),
    productIds: z.array(z.string()).optional(),
    
    // 🆕 NEW: User Eligibility
    userEligibility: z
      .nativeEnum(CouponUserEligibility)
      .default(CouponUserEligibility.ALL),
    eligibleUserIds: z.array(z.string()).optional(),
    newUserDays: z.number().int().positive().optional(),
    
    // Usage Limits
    maxUsage: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    
    // Validity
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
  )
  .refine(
    (data) => {
      // If scope is CATEGORY, categoryIds must be provided
      if (data.scope === CouponScope.CATEGORY) {
        return data.categoryIds && data.categoryIds.length > 0;
      }
      return true;
    },
    {
      message: "At least one category must be selected for CATEGORY scope",
      path: ["categoryIds"],
    }
  )
  .refine(
    (data) => {
      // If scope is PRODUCT, productIds must be provided
      if (data.scope === CouponScope.PRODUCT) {
        return data.productIds && data.productIds.length > 0;
      }
      return true;
    },
    {
      message: "At least one product must be selected for PRODUCT scope",
      path: ["productIds"],
    }
  )
  .refine(
    (data) => {
      // If userEligibility is SPECIFIC_USERS, eligibleUserIds must be provided
      if (data.userEligibility === CouponUserEligibility.SPECIFIC_USERS) {
        return data.eligibleUserIds && data.eligibleUserIds.length > 0;
      }
      return true;
    },
    {
      message:
        "At least one user must be selected for SPECIFIC_USERS eligibility",
      path: ["eligibleUserIds"],
    }
  )
  .refine(
    (data) => {
      // If userEligibility is NEW_USERS, newUserDays must be provided
      if (data.userEligibility === CouponUserEligibility.NEW_USERS) {
        return data.newUserDays && data.newUserDays > 0;
      }
      return true;
    },
    {
      message: "newUserDays must be specified for NEW_USERS eligibility",
      path: ["newUserDays"],
    }
  );

export type CreateCouponDTO = z.infer<typeof CreateCouponDTOSchema>;

// Update Coupon DTO - ENHANCED
export const UpdateCouponDTOSchema = z
  .object({
    description: z.string().optional(),
    discountType: z.nativeEnum(DiscountType).optional(),
    discountValue: z.number().positive().optional(),
    minOrderValue: z.number().min(0).optional(),
    maxDiscountAmount: z.number().positive().optional(), // 🆕 NEW
    
    // 🆕 NEW: Scope Management
    scope: z.nativeEnum(CouponScope).optional(),
    categoryIds: z.array(z.string()).optional(),
    productIds: z.array(z.string()).optional(),
    
    // 🆕 NEW: User Eligibility
    userEligibility: z.nativeEnum(CouponUserEligibility).optional(),
    eligibleUserIds: z.array(z.string()).optional(),
    newUserDays: z.number().int().positive().optional(),
    
    maxUsage: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.scope === CouponScope.CATEGORY) {
        return data.categoryIds && data.categoryIds.length > 0;
      }
      return true;
    },
    {
      message: "At least one category must be selected for CATEGORY scope",
      path: ["categoryIds"],
    }
  )
  .refine(
    (data) => {
      if (data.scope === CouponScope.PRODUCT) {
        return data.productIds && data.productIds.length > 0;
      }
      return true;
    },
    {
      message: "At least one product must be selected for PRODUCT scope",
      path: ["productIds"],
    }
  );

export type UpdateCouponDTO = z.infer<typeof UpdateCouponDTOSchema>;

// Validate Coupon DTO - 🆕 NEW (for client-side validation)
export const ValidateCouponDTOSchema = z.object({
  code: z.string(),
  userId: z.string().optional(),
  orderAmount: z.number().positive(),
  cartItems: z.array(
    z.object({
      productId: z.string(),
      categoryId: z.string().optional(),
      quantity: z.number().int().positive(),
      price: z.number().positive(),
    })
  ),
});

export type ValidateCouponDTO = z.infer<typeof ValidateCouponDTOSchema>;

// Apply Coupon DTO - ENHANCED
export const ApplyCouponDTOSchema = z.object({
  code: z.string(),
  orderAmount: z.number().positive(),
  cartItems: z.array(
    z.object({
      productId: z.string(),
      categoryId: z.string().optional(),
      quantity: z.number().int().positive(),
      price: z.number().positive(),
    })
  ),
});

export type ApplyCouponDTO = z.infer<typeof ApplyCouponDTOSchema>;

// Query Coupon DTO
export const QueryCouponDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  isActive: z.boolean().optional(),
  scope: z.nativeEnum(CouponScope).optional(), // 🆕 NEW
  sortBy: z.enum(["code", "createdAt", "validUntil"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryCouponDTO = z.infer<typeof QueryCouponDTOSchema>;

// Get Applicable Coupons DTO - 🆕 NEW
export const GetApplicableCouponsDTOSchema = z.object({
  orderAmount: z.number().positive(),
  cartItems: z.array(
    z.object({
       productId: z.string(),
      categoryId: z.string().optional(),
      quantity: z.number().int().positive(),
      price: z.number().positive(),
    })
  ),
});

export type GetApplicableCouponsDTO = z.infer<
  typeof GetApplicableCouponsDTOSchema
>;