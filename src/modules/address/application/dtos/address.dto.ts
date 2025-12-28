import { z } from "zod";

// Create Address DTO
export const CreateAddressDTOSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number"),
  addressLine1: z.string().min(1, "Address line 1 is required").max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State is required").max(100),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Invalid pincode"),
  country: z.string().default("India"),
  type: z.enum(["SHIPPING", "BILLING", "BOTH"]).default("SHIPPING"),
  isDefault: z.boolean().default(false),
});

export type CreateAddressDTO = z.infer<typeof CreateAddressDTOSchema>;

// Update Address DTO
export const UpdateAddressDTOSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional(),
  addressLine1: z.string().min(1).max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  pincode: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .optional(),
  country: z.string().optional(),
  type: z.enum(["SHIPPING", "BILLING", "BOTH"]).optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateAddressDTO = z.infer<typeof UpdateAddressDTOSchema>;
