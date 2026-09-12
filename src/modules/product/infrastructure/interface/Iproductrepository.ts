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
  create(
    data: {
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
      allowOutOfStockOrders?: boolean;
      hasVideoConsultation?: boolean;
      videoPurchasingEnabled?: boolean;
      videoConsultationNote?: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<Product>;

  update(id: bigint, data: any, tx?: Prisma.TransactionClient): Promise<Product>;
  delete(id: bigint, tx?: Prisma.TransactionClient): Promise<void>;

  findById(id: bigint, tx?: Prisma.TransactionClient): Promise<ProductWithRelations | null>;
  findBySlug(slug: string, tx?: Prisma.TransactionClient): Promise<Product | null>;
  findBySku(sku: string, tx?: Prisma.TransactionClient): Promise<Product | null>;

  // User-facing: respects isActive on products + media
  findAll(params: PaginatedProductParams, tx?: Prisma.TransactionClient): Promise<Product[]>;
  count(where: any, tx?: Prisma.TransactionClient): Promise<number>;

  // 🆕 Admin: fetches all products regardless of isActive
  findAllAdmin(params: PaginatedProductParams, tx?: Prisma.TransactionClient): Promise<AdminProductWithRelations[]>;
  countAdmin(where?: Prisma.ProductWhereInput, tx?: Prisma.TransactionClient): Promise<number>;

  // Specifications
  addSpecification(productId: bigint, key: string, value: string, tx?: Prisma.TransactionClient): Promise<any>;
  updateSpecification(id: bigint, value: string, tx?: Prisma.TransactionClient): Promise<any>;
  deleteSpecification(id: bigint, tx?: Prisma.TransactionClient): Promise<void>;

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
    },
    tx?: Prisma.TransactionClient
  ): Promise<any>;
  updateMedia(id: bigint, data: any, tx?: Prisma.TransactionClient): Promise<any>;
  deleteMedia(id: bigint, tx?: Prisma.TransactionClient): Promise<void>;

  // Variants
  addVariant(
    data: {
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
    },
    tx?: Prisma.TransactionClient
  ): Promise<ProductVariant>;

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
      sku?: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<ProductVariant>;

  deleteVariant(id: bigint, tx?: Prisma.TransactionClient): Promise<void>;
  findVariantById(id: bigint, tx?: Prisma.TransactionClient): Promise<ProductVariant | null>;

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
    },
    tx?: Prisma.TransactionClient
  ): Promise<any>;
  updateVariantMedia(id: bigint, data: any, tx?: Prisma.TransactionClient): Promise<any>;
  deleteVariantMedia(id: bigint, tx?: Prisma.TransactionClient): Promise<void>;

  // Stock
  getStock(
    productId: bigint,
    warehouseId: bigint,
    variantId: bigint | null,
    tx?: Prisma.TransactionClient
  ): Promise<any>;
  updateStock(
    productId: bigint,
    variantId: bigint | null,
    warehouseId: bigint,
    quantity: number,
    lowStockThreshold: number,
    reason: string,
    tx?: Prisma.TransactionClient
  ): Promise<any>;
  getAllDescendantIdsAdmin(categoryId: bigint): Promise<bigint[]>;
}