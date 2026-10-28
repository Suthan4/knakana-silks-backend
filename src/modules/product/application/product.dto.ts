import { z } from "zod";
import { MediaType } from "@/generated/prisma/enums.js";

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

// UPDATED: Media schema (replaces ImageSchema)
const MediaSchema = z.object({
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE),
  url: z.string().url("Invalid media URL"),
  key: z.string().optional(), // R2 object key
  thumbnailUrl: z.string().url().optional(), // For videos
  altText: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(), // For videos in seconds
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

// 🆕 Variant Media schema (for variant-specific media)
const VariantMediaSchema = z.object({
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE),
  url: z.string().url("Invalid media URL"),
  key: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

// 🆕 ENHANCED: Variant schema with media, pricing, dimensions, and dynamic attributes
export const VariantSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(), // For targeted updates

  // Dynamic attributes (flexible key-value pairs)
  attributes: z.record(z.string(), z.any()).optional(),

  // Legacy fields (backward compatibility)
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),

  // Pricing (optional - falls back to product pricing)
  basePrice: z.number().positive("Base price must be positive").optional(),
  sellingPrice: z
    .number()
    .positive("Selling price must be positive")
    .optional(),
  price: z.number().positive("Variant price must be positive").optional(), // Legacy field (optional fallback)

  // Shipping dimensions (optional - falls back to product dimensions)
  weight: z.number().positive().max(50).optional(),
  length: z.number().positive().max(200).optional(),
  breadth: z.number().positive().max(200).optional(),
  height: z.number().positive().max(200).optional(),

  sku: z.string().optional(),
  isActive: z.boolean().optional(),

  // Variant-specific media
  media: z.array(VariantMediaSchema).optional(),

  // Stock
  stock: StockSchema.optional(),
});

// Create Product DTO
export const CreateProductDTOSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().min(1, "Product description is required"),
  categoryId: z.string().min(1, "Category ID is required"),
  basePrice: z.number().positive("Base price must be positive"),
  sellingPrice: z.number().positive("Selling price must be positive"),
  sku: z.string().optional(), // 🆕 Optional - will auto-generate if not provided
  isActive: z.boolean().optional().default(true),
  hasVariants: z.boolean().optional(),
  hsnCode: z.string().optional(),
  artisanName: z.string().optional(),
  artisanAbout: z.string().optional(),
  artisanLocation: z.string().optional(),
  allowOutOfStockOrders: z.boolean().optional().default(false),
  hasVideoConsultation: z.boolean().optional().default(false),
  videoPurchasingEnabled: z.boolean().optional().default(false),
  videoConsultationNote: z.string().optional(),

  // 🆕 Shipping Dimensions (Required for Shiprocket)
  weight: z
    .number()
    .positive("Weight must be positive")
    .max(50, "Weight cannot exceed 50kg"),
  length: z
    .number()
    .positive("Length must be positive")
    .max(200, "Length cannot exceed 200cm"),
  breadth: z
    .number()
    .positive("Breadth must be positive")
    .max(200, "Breadth cannot exceed 200cm"),
  height: z
    .number()
    .positive("Height must be positive")
    .max(200, "Height cannot exceed 200cm"),

  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  schemaMarkup: z.string().optional(),
  specifications: z.array(SpecificationSchema).optional(),
  media: z.array(MediaSchema).optional(), // UPDATED: Changed from images to media
  variants: z.array(VariantSchema).optional(),
  stock: StockSchema.optional(), // For simple products
});

export type CreateProductDTO = z.infer<typeof CreateProductDTOSchema>;

// Update Product DTO
export const UpdateProductDTOSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  basePrice: z.number().positive().optional(),
  sellingPrice: z.number().positive().optional(),
  sku: z.string().optional(), // 🆕 Allow SKU updates
  isActive: z.boolean().optional(),
  hasVariants: z.boolean().optional(),
  hsnCode: z.string().optional(),
  artisanName: z.string().optional(),
  artisanAbout: z.string().optional(),
  artisanLocation: z.string().optional(),
  allowOutOfStockOrders: z.boolean().optional(),
  hasVideoConsultation: z.boolean().optional(),
  videoPurchasingEnabled: z.boolean().optional(),
  videoConsultationNote: z.string().optional(),

  // 🆕 Shipping Dimensions (Optional in update)
  weight: z.number().positive().max(50).optional(),
  length: z.number().positive().max(200).optional(),
  breadth: z.number().positive().max(200).optional(),
  height: z.number().positive().max(200).optional(),

  stock: StockSchema.optional(),
  variants: z.array(VariantSchema).optional(),

  specifications: z.array(SpecificationSchema).optional(),
  media: z.array(MediaSchema).optional(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  schemaMarkup: z.string().optional(),
});

export type UpdateProductDTO = z.infer<typeof UpdateProductDTOSchema>;

// Patch Product DTO
export const PatchProductDTOSchema = UpdateProductDTOSchema.partial().extend({
  variants: z.array(VariantSchema.partial()).optional(),
  stock: StockSchema.partial().optional(),
  specifications: z.array(SpecificationSchema.partial()).optional(),
  media: z.array(MediaSchema.partial()).optional(),
});
export type PatchProductDTO = z.infer<typeof PatchProductDTOSchema>;


/**
 * Consolidate existing simple products into one variable product.
 * Each selected product becomes one existing variant, retaining its SKU.
 */
export const ConsolidateSimpleProductsDTOSchema = z.object({
  parentProductId: z.string().regex(/^[1-9]\d*$/, "Parent product ID must be a positive integer"),
  attributeName: z.string().trim().min(1, "Attribute name is required").max(60, "Attribute name must be 60 characters or fewer").transform((value) => value.toLocaleLowerCase().replace(/[\\s-]+/g, "_").replace(/[^\\p{L}\\p{N}_]/gu, "")),
  products: z.array(z.object({
    productId: z.string().regex(/^[1-9]\d*$/, "Product ID must be a positive integer"),
    attributeValue: z.string().trim().min(1, "Variant value is required").max(120),
  })).min(2, "Select at least two products to consolidate").max(100),
}).superRefine((data, ctx) => {
  const ids = data.products.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each product can only be selected once", path: ["products"] });
  }
  if (!ids.includes(data.parentProductId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The parent product must be one of the selected products", path: ["parentProductId"] });
  }
  const values = data.products.map((item) => item.attributeValue.trim().toLocaleLowerCase());
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Variant values must be unique", path: ["products"] });
  }
});
export type ConsolidateSimpleProductsDTO = z.infer<typeof ConsolidateSimpleProductsDTOSchema>;


/** Attach an existing simple product to an existing variable product. */
export const AddSimpleProductAsVariantDTOSchema = z.object({
  parentProductId: z.string().regex(/^[1-9]\d*$/, "Parent product ID must be a positive integer"),
  sourceProductId: z.string().regex(/^[1-9]\d*$/, "Source product ID must be a positive integer"),
  attributeName: z.enum(["color", "size", "fabric", "style"]),
  attributeValue: z.string().trim().min(1, "Variant value is required").max(120),
}).superRefine((data, ctx) => {
  if (data.parentProductId === data.sourceProductId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Source and target products must be different", path: ["sourceProductId"] });
  }
});
export type AddSimpleProductAsVariantDTO = z.infer<typeof AddSimpleProductAsVariantDTOSchema>;

/** Extract an existing variant as a standalone simple product. */
export const ExtractVariantAsSimpleProductDTOSchema = z.object({
  parentProductId: z.string().regex(/^[1-9]\d*$/, "Parent product ID must be a positive integer"),
  variantId: z.string().regex(/^[1-9]\d*$/, "Variant ID must be a positive integer"),
  productName: z.string().trim().min(2, "Product name must contain at least 2 characters").max(180),
  productSku: z.string().trim().min(2).max(100).optional(),
});
export type ExtractVariantAsSimpleProductDTO = z.infer<typeof ExtractVariantAsSimpleProductDTOSchema>;

// Query Product DTO
// Enhanced Product Query DTO with URL params support
export const QueryProductDTOSchema = z.object({
  // Pagination
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(12),

  // Search
  search: z.string().trim().optional(),

  // Categories - Support multiple ways to filter
  categorySlug: z.string().optional(),
  categoryId: z.string().optional(),
  categoryIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) =>
      typeof val === "string" ? val.split(",").filter(Boolean) : val
    ),

  // Product Flags
  // Query parameters arrive as strings; z.coerce.boolean() incorrectly treats "false" as true.
  // Preserve explicit true/false and keep omitted values undefined for admin "all" filters.
  isActive: z.preprocess(
    (value) => value === "true" ? true : value === "false" ? false : value,
    z.boolean().optional()
  ),
  hasVariants: z.preprocess(
    (value) => value === "true" ? true : value === "false" ? false : value,
    z.boolean().optional()
  ),

  // Price Range
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),

  // Sorting
  sortBy: z
    .enum(["createdAt", "price", "name", "popularity"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),

  // Filters (Advanced)
  color: z.string().optional(),
  fabric: z.string().optional(),
  size: z.string().optional(),
  artisan: z.string().optional(),

  // Stock availability
  inStock: z.coerce.boolean().optional(),
});

export type QueryProductDTO = z.infer<typeof QueryProductDTOSchema>;

// Add Specification DTO
export const AddSpecificationDTOSchema = z.object({
  key: z.string().min(1, "Specification key is required"),
  value: z.string().min(1, "Specification value is required"),
});

export type AddSpecificationDTO = z.infer<typeof AddSpecificationDTOSchema>;

// UPDATED: Add Media DTO (replaces AddImageDTO)
export const AddMediaDTOSchema = z.object({
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE),
  url: z.string().url("Invalid media URL"),
  key: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type AddMediaDTO = z.infer<typeof AddMediaDTOSchema>;

// 🆕 Add Variant Media DTO
export const AddVariantMediaDTOSchema = z.object({
  type: z.nativeEnum(MediaType).default(MediaType.IMAGE),
  url: z.string().url("Invalid media URL"),
  key: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type AddVariantMediaDTO = z.infer<typeof AddVariantMediaDTOSchema>;

// 🆕 ENHANCED: Add Variant DTO with all new features
export const AddVariantDTOSchema = z.object({
  // Dynamic attributes
  attributes: z.record(z.string(),z.string()).optional(),

  // Legacy fields
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),

  // Pricing (optional - falls back to product pricing)
  basePrice: z.number().positive("Base price must be positive").optional(),
  sellingPrice: z
    .number()
    .positive("Selling price must be positive")
    .optional(),
  price: z.number().positive("Variant price must be positive"), // Legacy field

  // Shipping dimensions (optional - falls back to product dimensions)
  weight: z.number().positive().max(50).optional(),
  length: z.number().positive().max(200).optional(),
  breadth: z.number().positive().max(200).optional(),
  height: z.number().positive().max(200).optional(),

  // Variant-specific media
  media: z.array(VariantMediaSchema).optional(),

  // Stock
  stock: StockSchema.optional(),
});

export type AddVariantDTO = z.infer<typeof AddVariantDTOSchema>;

// 🆕 Update Variant DTO
export const UpdateVariantDTOSchema = z.object({
  // Dynamic attributes
  attributes: z.record(z.string(),z.string()).optional(),

  // Legacy fields
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),

  // Pricing
  basePrice: z.number().positive().optional(),
  sellingPrice: z.number().positive().optional(),
  price: z.number().positive().optional(),

  // Shipping dimensions
  weight: z.number().positive().max(50).optional(),
  length: z.number().positive().max(200).optional(),
  breadth: z.number().positive().max(200).optional(),
  height: z.number().positive().max(200).optional(),
});

export type UpdateVariantDTO = z.infer<typeof UpdateVariantDTOSchema>;

// Update Stock DTO
export const UpdateStockDTOSchema = z.object({
  variantId: z.string().optional(), // Optional - for variant stock
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z.number().int().min(0, "Quantity must be a positive number"),
  lowStockThreshold: z.number().int().min(0).optional().default(10),
  reason: z.string().min(1, "Reason for stock update is required"),
});

export type UpdateStockDTO = z.infer<typeof UpdateStockDTOSchema>;
