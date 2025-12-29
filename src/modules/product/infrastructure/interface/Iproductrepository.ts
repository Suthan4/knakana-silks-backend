import { Product } from "@/generated/prisma/client.js";

export interface IProductRepository {
  create(data: {
    name: string;
    slug: string;
    description: string;
    categoryId: bigint;
    basePrice: number;
    sellingPrice: number;
    sku: string;
    isActive: boolean;
    hasVariants: boolean; // NEW FIELD
    hsnCode?: string;
    artisanName?: string;
    artisanAbout?: string;
    artisanLocation?: string;
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

  // Images
  addImage(
    productId: bigint,
    url: string,
    altText?: string,
    order?: number
  ): Promise<any>;
  deleteImage(id: bigint): Promise<void>;

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

  // Stock - UPDATED SIGNATURE
  getStock(productId: bigint,warehouseId:bigint, variantId: bigint|null): Promise<any>;
  updateStock(
    productId: bigint,
    variantId: bigint | null, // Can be null for simple products
    warehouseId: bigint,
    quantity: number,
    lowStockThreshold: number,
    reason: string
  ): Promise<any>;
}
