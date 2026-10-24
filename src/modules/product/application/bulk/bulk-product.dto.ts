import { z } from "zod";
import { MediaType } from "@/generated/prisma/enums.js";

// ============================================================================
// DTOs for Parsed Workbook Rows
// ============================================================================

export interface BulkProductRow {
  rowNumber: number;
  productGroupId: string;
  name: string;
  categoryPath: string;
  productType: "simple" | "variable";
  description: string;
  sku?: string;
  basePrice: number;
  sellingPrice: number;
  stockQuantity?: number;
  warehouseCodeOrName?: string;
  lowStockThreshold?: number;
  hsnCode?: string;
  artisanName?: string;
  artisanAbout?: string;
  artisanLocation?: string;
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
  allowOutOfStockOrders?: boolean;
  hasVideoConsultation?: boolean;
  videoPurchasingEnabled?: boolean;
  videoConsultationNote?: string;
  isActive?: boolean;
}

export interface BulkVariantRow {
  rowNumber: number;
  productGroupId: string;
  variantSku?: string;
  size?: string;
  color?: string;
  fabric?: string;
  attributes?: Record<string, string>;
  basePrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  warehouseCodeOrName?: string;
  lowStockThreshold?: number;
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
}

export interface BulkSeoRow {
  rowNumber: number;
  productGroupId: string;
  metaTitle?: string;
  metaDesc?: string;
  slug?: string;
  schemaMarkup?: string;
}

export interface BulkMediaRow {
  rowNumber: number;
  productGroupId: string;
  variantSku?: string;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  title?: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

// ============================================================================
// Aggregated & Validated Product Structure (used by both UI and Import)
// ============================================================================

export interface BulkParsedVariant {
  rowNumber?: number;
  sku?: string;
  size?: string;
  color?: string;
  fabric?: string;
  attributes?: Record<string, string>;
  basePrice?: number;
  sellingPrice?: number;
  stock?: {
    warehouseId: string;
    warehouseCode?: string;
    quantity: number;
    lowStockThreshold?: number;
  };
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
  media?: BulkParsedMedia[];
  errors?: string[];
}

export interface BulkParsedMedia {
  rowNumber?: number;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  title?: string;
  description?: string;
  order?: number;
  isActive?: boolean;
  variantSku?: string;
  productGroupId?: string;
}

export interface BulkParsedProduct {
  rowNumber?: number;
  productGroupId: string;
  name: string;
  categoryPath: string;
  categoryId?: string;
  categoryName?: string;
  productType: "simple" | "variable";
  description: string;
  sku?: string;
  basePrice: number;
  sellingPrice: number;
  stock?: {
    warehouseId: string;
    warehouseCode?: string;
    quantity: number;
    lowStockThreshold?: number;
  };
  hsnCode?: string;
  artisanName?: string;
  artisanAbout?: string;
  artisanLocation?: string;
  weight: number;
  length: number;
  breadth: number;
  height: number;
  allowOutOfStockOrders?: boolean;
  hasVideoConsultation?: boolean;
  videoPurchasingEnabled?: boolean;
  videoConsultationNote?: string;
  isActive?: boolean;
  seo?: {
    metaTitle?: string;
    metaDesc?: string;
    slug?: string;
    schemaMarkup?: string;
  };
  media?: BulkParsedMedia[];
  variants?: BulkParsedVariant[];
  // New fields for raw-text import
  importNote?: string; // preserves any unrecognised original text
  groupSuggestion?: {
    type: "variable" | "simple" | "collection";
    confidence: number; // 0..1
  };
  isValid?: boolean;
  errors?: BulkValidationError[];
}

// ============================================================================
// Error & Report Structures
// ============================================================================

export interface BulkValidationError {
  sheet: "Products" | "Variants" | "SEO" | "Media" | "General";
  row?: number;
  productGroupId?: string;
  field: string;
  message: string;
  fix: string;
  severity: "error" | "warning";
}

export interface BulkValidationSummary {
  totalProducts: number;
  simpleProducts: number;
  variableProducts: number;
  totalVariants: number;
  totalMedia: number;
  validProducts: number;
  invalidProducts: number;
  errorCount: number;
  warningCount: number;
}

export interface BulkValidationResponse {
  valid: boolean;
  summary: BulkValidationSummary;
  errors: BulkValidationError[];
  products: BulkParsedProduct[];
}

export interface BulkImportItemResult {
  productGroupId: string;
  name: string;
  sku?: string;
  status: "success" | "failed" | "skipped";
  productId?: string;
  error?: string;
}

export interface BulkImportResponse {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  results: BulkImportItemResult[];
}

// ============================================================================
// Zod Schemas for API Requests
// ============================================================================

export const BulkExportSchema = z.object({
  categoryIds: z.array(z.string()).optional(),
  products: z.array(z.any()).optional(),
});

export const BulkImportPayloadSchema = z.object({
  products: z.array(z.any()).min(1, "At least one product is required for import"),
});

