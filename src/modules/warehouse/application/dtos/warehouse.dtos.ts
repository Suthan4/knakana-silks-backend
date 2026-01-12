import { z } from "zod";

// Create Warehouse DTO
export const CreateWarehouseDTOSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(20)
    .toUpperCase(),

  // 🆕 Complete Address
  address: z.string().min(1, "Address is required"),
  addressLine2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Invalid pincode"),
  country: z.string().default("India"),

  // 🆕 Contact Information
  contactPerson: z.string().min(1, "Contact person is required"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number"),
  email: z.string().email("Invalid email").optional(),

  // 🆕 Shiprocket Integration
  isDefaultPickup: z.boolean().default(false),

  isActive: z.boolean().default(true),
});

export type CreateWarehouseDTO = z.infer<typeof CreateWarehouseDTOSchema>;

// Update Warehouse DTO
export const UpdateWarehouseDTOSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).optional(),
  addressLine2: z.string().optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  pincode: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .optional(),
  country: z.string().optional(),
  contactPerson: z.string().min(1).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional(),
  email: z.string().email().optional(),
  isDefaultPickup: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateWarehouseDTO = z.infer<typeof UpdateWarehouseDTOSchema>;

// Query Warehouse DTO
export const QueryWarehouseDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["name", "code", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryWarehouseDTO = z.infer<typeof QueryWarehouseDTOSchema>;
