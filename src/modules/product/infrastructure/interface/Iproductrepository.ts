import { Prisma, Product, ProductVariant } from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    specifications: true;
    variants: {
      include: {
        media: { where: { isActive: true }, orderBy: { order: "asc" } },
        stock: true;
      };
    };
    media: { where: { isActive: true }, orderBy: { order: "asc" } },
    stock: true;
  };
}>;

// 🆕 Admin variant — no isActive constraint on media
export type AdminProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    specifications: true;
    variants: {
      include: {
        media: { orderBy: { order: "asc" } }; // No isActive filter
        stock: true;
      };
    };
    media: { orderBy: { order: "asc" } }; // No isActive filter
    stock: true;
  };
}>;

// 🆕 Shared pagination params shape
export interface PaginatedProductParams {
  skip: number;
  take: number;
  where?: Prisma.ProductWhereInput;
  orderBy?: Prisma.ProductOrderByWithRelationInput;
  include?: Prisma.ProductInclude;
}

export interface IProductRepository {
  create(data: {
    name: string;
    slug: string;
    description: string;
    categoryId: bigint;
    basePrice: number;
    sellingPrice: number;
    sku?: string;
    isActive: boolean;
    hasVariants: boolean;
    hsnCode?: string;
    artisanName?: string;
    artisanAbout?: string;
    artisanLocation?: string;
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
    volumetricWeight?: number;
    metaTitle?: string;
    metaDesc?: string;
    schemaMarkup?: string;
  }): Promise<Product>;

  update(id: bigint, data: any): Promise<Product>;
  delete(id: bigint): Promise<void>;

  findById(id: bigint): Promise<ProductWithRelations | null>;
  findBySlug(slug: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;

  // User-facing: respects isActive on products + media
  findAll(params: PaginatedProductParams): Promise<Product[]>;
  count(where: any): Promise<number>;

  // 🆕 Admin: fetches all products regardless of isActive
  findAllAdmin(params: PaginatedProductParams): Promise<AdminProductWithRelations[]>;
  countAdmin(where?: Prisma.ProductWhereInput): Promise<number>;

  // Specifications
  addSpecification(productId: bigint, key: string, value: string): Promise<any>;
  updateSpecification(id: bigint, value: string): Promise<any>;
  deleteSpecification(id: bigint): Promise<void>;

  // Media
  addMedia(
    productId: bigint,
    data: {
      type: MediaType;
      url: string;
      key?: string;
      thumbnailUrl?: string;
      altText?: string;
      title?: string;
      description?: string;
      mimeType?: string;
      fileSize?: bigint;
      duration?: number;
      width?: number;
      height?: number;
      order?: number;
      isActive?: boolean;
    }
  ): Promise<any>;
  updateMedia(id: bigint, data: any): Promise<any>;
  deleteMedia(id: bigint): Promise<void>;

  // Variants
  addVariant(data: {
    productId: bigint;
    attributes?: Record<string, any>;
    size?: string;
    color?: string;
    fabric?: string;
    basePrice?: number;
    sellingPrice?: number;
    price: number;
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
    volumetricWeight?: number;
    sku: string;
  }): Promise<ProductVariant>;

  updateVariant(
    id: bigint,
    data: {
      attributes?: Record<string, any>;
      size?: string;
      color?: string;
      fabric?: string;
      basePrice?: number;
      sellingPrice?: number;
      price?: number;
      weight?: number;
      length?: number;
      breadth?: number;
      height?: number;
      volumetricWeight?: number;
    }
  ): Promise<ProductVariant>;

  deleteVariant(id: bigint): Promise<void>;
  findVariantById(id: bigint): Promise<ProductVariant | null>;

  // Variant Media
  addVariantMedia(
    variantId: bigint,
    data: {
      type: MediaType;
      url: string;
      key?: string;
      thumbnailUrl?: string;
      altText?: string;
      title?: string;
      description?: string;
      mimeType?: string;
      fileSize?: bigint;
      duration?: number;
      width?: number;
      height?: number;
      order?: number;
      isActive?: boolean;
    }
  ): Promise<any>;
  updateVariantMedia(id: bigint, data: any): Promise<any>;
  deleteVariantMedia(id: bigint): Promise<void>;

  // Stock
  getStock(
    productId: bigint,
    warehouseId: bigint,
    variantId: bigint | null
  ): Promise<any>;
  updateStock(
    productId: bigint,
    variantId: bigint | null,
    warehouseId: bigint,
    quantity: number,
    lowStockThreshold: number,
    reason: string
  ): Promise<any>;
}