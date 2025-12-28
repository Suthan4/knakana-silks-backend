import { z } from "zod";

// Create Product DTO
export const CreateProductDTOSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().min(1, "Description is required"),
  categoryId: z.string(),
  basePrice: z.number().positive("Base price must be positive"),
  sellingPrice: z.number().positive("Selling price must be positive"),
  isActive: z.boolean().default(true),
  artisanName:z.string().max(60).optional(),
  artisanAbout:z.string().max(160).optional(),  
  artisanLocation: z.string().max(60).optional(),
  metaTitle: z.string().max(60).optional(),
  metaDesc: z.string().max(160).optional(),
  schemaMarkup: z.string().optional(),
  specifications: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      })
    )
    .optional(),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        altText: z.string().optional(),
        order: z.number().int().default(0),
      })
    )
    .optional(),
  variants: z
    .array(
      z.object({
        size: z.string().optional(),
        color: z.string().optional(),
        fabric: z.string().optional(),
        price: z.number().positive(),
      })
    )
    .optional(),
  stock: z
    .object({
      quantity: z.number().int().min(0),
      lowStockThreshold: z.number().int().default(10),
    })
    .optional(),
});

export type CreateProductDTO = z.infer<typeof CreateProductDTOSchema>;

// Update Product DTO
export const UpdateProductDTOSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  basePrice: z.number().positive().optional(),
  sellingPrice: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  metaTitle: z.string().max(60).optional(),
  metaDesc: z.string().max(160).optional(),
  schemaMarkup: z.string().optional(),
});

export type UpdateProductDTO = z.infer<typeof UpdateProductDTOSchema>;

// Query Product DTO
export const QueryProductDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.boolean().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  sortBy: z.enum(["name", "price", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryProductDTO = z.infer<typeof QueryProductDTOSchema>;

// Add Variant DTO
export const AddVariantDTOSchema = z.object({
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),
  price: z.number().positive(),
});

export type AddVariantDTO = z.infer<typeof AddVariantDTOSchema>;

// Add Specification DTO
export const AddSpecificationDTOSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

export type AddSpecificationDTO = z.infer<typeof AddSpecificationDTOSchema>;

// Add Image DTO
export const AddImageDTOSchema = z.object({
  url: z.string().url(),
  altText: z.string().optional(),
  order: z.number().int().default(0),
});

export type AddImageDTO = z.infer<typeof AddImageDTOSchema>;

// Update Stock DTO
export const UpdateStockDTOSchema = z.object({
  quantity: z.number().int(),
  reason: z.string().min(1),
});

export type UpdateStockDTO = z.infer<typeof UpdateStockDTOSchema>;
