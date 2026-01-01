import { z } from "zod";

// Stock schema for both simple products and variants
const StockSchema = z.object({
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z.number().int().min(0, "Quantity must be a positive number"),
  lowStockThreshold: z.number().int().min(0).optional().default(10),
});

// Specification schema
const SpecificationSchema = z.object({
  key: z.string().min(1, "Specification key is required"),
  value: z.string().min(1, "Specification value is required"),
});

// Image schema
const ImageSchema = z.object({
  url: z.string().url("Invalid image URL"),
  altText: z.string().optional(),
  order: z.number().int().min(0).optional().default(0),
});

// Variant schema
const VariantSchema = z.object({
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),
  price: z.number().positive("Variant price must be positive"),
  stock: StockSchema.optional(),
});

// Create Product DTO
export const CreateProductDTOSchema = z
  .object({
    name: z.string().min(1, "Product name is required"),
    description: z.string().min(1, "Product description is required"),
    categoryId: z.string().min(1, "Category ID is required"),
    basePrice: z.number().positive("Base price must be positive"),
    sellingPrice: z.number().positive("Selling price must be positive"),
    isActive: z.boolean().optional().default(true),
    hsnCode: z.string().optional(),
    artisanName: z.string().optional(),
    artisanAbout: z.string().optional(),
    artisanLocation: z.string().optional(),
    metaTitle: z.string().optional(),
    metaDesc: z.string().optional(),
    schemaMarkup: z.string().optional(),
    specifications: z.array(SpecificationSchema).optional(),
    images: z.array(ImageSchema).optional(),
    variants: z.array(VariantSchema).optional(),
    stock: StockSchema.optional(), // For simple products
  })
  .refine(
    (data) => {
      // Either variants OR stock must be provided, but not both
      const hasVariants = data.variants && data.variants.length > 0;
      const hasStock = !!data.stock;

      if (hasVariants && hasStock) {
        return false; // Cannot have both
      }

      if (!hasVariants && !hasStock) {
        return false; // Must have one
      }

      // If has variants, each variant should have stock
      if (hasVariants) {
        return data.variants!.every((v) => v.stock !== undefined);
      }

      return true;
    },
    {
      message:
        "Product must have either stock (simple product) or variants with stock (variable product), but not both",
    }
  );

export type CreateProductDTO = z.infer<typeof CreateProductDTOSchema>;

// Update Product DTO
export const UpdateProductDTOSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  basePrice: z.number().positive().optional(),
  sellingPrice: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  hsnCode: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
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
  hasVariants: z.boolean().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  sortBy: z
    .enum(["createdAt", "price", "name"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type QueryProductDTO = z.infer<typeof QueryProductDTOSchema>;

// Add Specification DTO
export const AddSpecificationDTOSchema = z.object({
  key: z.string().min(1, "Specification key is required"),
  value: z.string().min(1, "Specification value is required"),
});

export type AddSpecificationDTO = z.infer<typeof AddSpecificationDTOSchema>;

// Add Image DTO
export const AddImageDTOSchema = z.object({
  url: z.string().url("Invalid image URL"),
  altText: z.string().optional(),
  order: z.number().int().min(0).optional().default(0),
});

export type AddImageDTO = z.infer<typeof AddImageDTOSchema>;

// Add Variant DTO
export const AddVariantDTOSchema = z.object({
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),
  price: z.number().positive("Variant price must be positive"),
  stock: StockSchema.optional(),
});

export type AddVariantDTO = z.infer<typeof AddVariantDTOSchema>;

// Update Stock DTO
export const UpdateStockDTOSchema = z.object({
  variantId: z.string().optional(), // Optional - for variant stock
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z.number().int().min(0, "Quantity must be a positive number"),
  lowStockThreshold: z.number().int().min(0).optional().default(10),
  reason: z.string().min(1, "Reason for stock update is required"),
});

export type UpdateStockDTO = z.infer<typeof UpdateStockDTOSchema>;
