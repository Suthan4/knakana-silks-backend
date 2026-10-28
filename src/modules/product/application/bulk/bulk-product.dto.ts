import { z } from "zod";
import { MediaType } from "@/generated/prisma/enums.js";

// ============================================================================
// DTOs for Parsed Workbook Rows
// ============================================================================

export interface BulkProductRow {
  id?: string;
  rowNumber: number;
  productGroupId: string;
  name: string;
  categoryPath: string;
  categoryId?: string;
  productType: "simple" | "variable";
  description: string;
  sku?: string;
  basePrice: number;
  sellingPrice: number;
  stockQuantity?: number;
  warehouseCodeOrName?: string;
  warehouseId?: string;
  lowStockThreshold?: number;
  metaTitle?: string;
  metaDesc?: string;
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
  specifications?: Array<{ key: string; value: string }>;
  isActive?: boolean;
}

export interface BulkVariantRow {
  id?: string | number;
  rowNumber: number;
  productGroupId: string;
  variantSku?: string;
  sku?: string;
  title?: string;
  size?: string;
  color?: string;
  fabric?: string;
  attributes?: Record<string, string> | any;
  basePrice?: number;
  sellingPrice?: number;
  price?: number;
  stockQuantity?: number;
  warehouseCodeOrName?: string;
  warehouseId?: string;
  lowStockThreshold?: number;
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
  media?: BulkMediaRow[];
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
  key?: string;
  /** Transient association for retriable Drive-to-S3 jobs; not persisted on ProductMedia. */
  sourceDriveFileId?: string;
  thumbnailUrl?: string;
  altText?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
  order?: number;
  isActive?: boolean;
}

// ============================================================================
// Aggregated & Validated Product Structure (used by both UI and Import)
// ============================================================================

export interface BulkParsedVariant {
  id?: string | number;
  rowNumber?: number;
  sku?: string;
  title?: string;
  size?: string;
  color?: string;
  fabric?: string;
  attributes?: Record<string, string> | any;
  basePrice?: number;
  sellingPrice?: number;
  price?: number;
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
  key?: string;
  /** Keeps the Drive-to-S3 association for background job retries. */
  sourceDriveFileId?: string;
  thumbnailUrl?: string;
  altText?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
  order?: number;
  isActive?: boolean;
  variantSku?: string;
  productGroupId?: string;
  source?: "product" | "variant";
}

export interface BulkParsedProduct {
  id?: string;
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
  // SEO fields directly on product JSON object
  metaTitle?: string;
  metaDesc?: string;
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
  specifications?: Array<{ key: string; value: string }>;
  seo?: {
    metaTitle?: string;
    metaDesc?: string;
    slug?: string;
    schemaMarkup?: string;
  };
  media?: BulkParsedMedia[];
  variants?: BulkParsedVariant[];
  /** Unified collection of all images across product and variants for preview display */
  allImages?: BulkParsedMedia[];
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

// ============================================================================
// Import Execution Results
// ============================================================================

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
