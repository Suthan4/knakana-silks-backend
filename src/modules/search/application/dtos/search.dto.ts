import { Prisma } from "@/generated/prisma/client.js";
import { z } from "zod";
export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    media: true;
    stock: true;
  };
}>;

export type CategoryWithParentAndCount = Prisma.CategoryGetPayload<{
  include: {
    parent: true;
    _count: {
      select: {
        products: true;
      };
    };
  };
}>;

// Unified Search Query DTO
export const UnifiedSearchDTOSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  type: z
    .enum(["all", "products", "categories"])
    .default("all")
    .optional(),
  includeInactive: z.coerce.boolean().default(false).optional(),
});

export type UnifiedSearchDTO = z.infer<typeof UnifiedSearchDTOSchema>;

// Search Result Types
export interface ProductSearchResult {
  type: "product";
  id: string;
  name: string;
  slug: string;
  description: string;
  sellingPrice: number;
  basePrice: number;
  image?: string;
  categoryName?: string;
  categorySlug?: string;
  inStock: boolean;
  relevanceScore: number;
}

export interface CategorySearchResult {
  type: "category";
  id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  productCount: number;
  parentName?: string;
  relevanceScore: number;
}

export type SearchResult = ProductSearchResult | CategorySearchResult;

export interface UnifiedSearchResponse {
  success: boolean;
  data: {
    results: SearchResult[];
    summary: {
      total: number;
      products: number;
      categories: number;
      query: string;
    };
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}