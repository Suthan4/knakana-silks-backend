import { Product } from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";

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
    // 🆕 Shipping Dimensions
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

  findById(id: bigint): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findAll(params: any): Promise<Product[]>;
  count(where: any): Promise<number>;

  // Specifications
  addSpecification(productId: bigint, key: string, value: string): Promise<any>;
  updateSpecification(id: bigint, value: string): Promise<any>;
  deleteSpecification(id: bigint): Promise<void>;

  // UPDATED: Media methods (replaces image methods)
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
    size?: string;
    color?: string;
    fabric?: string;
    price: number;
    sku: string;
  }): Promise<any>;
  deleteVariant(id: bigint): Promise<void>;

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
