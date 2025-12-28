import {
  Product,
  ProductVariant,
  Specification,
  ProductImage,
  Stock,
} from "@/generated/prisma/client.js";

export interface IProductRepository {
  findById(id: bigint): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
    include?: any;
  }): Promise<Product[]>;
  count(where?: any): Promise<number>;
  create(data: {
    name: string;
    slug: string;
    description: string;
    categoryId: bigint;
    basePrice: number;
    sellingPrice: number;
    sku: string;
    isActive: boolean;
    artisanName?: string;
    artisanAbout?: string;
    artisanLocation?: string;
    metaTitle?: string;
    metaDesc?: string;
    schemaMarkup?: string;
  }): Promise<Product>;
  update(id: bigint, data: Partial<Product>): Promise<Product>;
  delete(id: bigint): Promise<void>;

  // Specifications
  addSpecification(
    productId: bigint,
    key: string,
    value: string
  ): Promise<Specification>;
  updateSpecification(id: bigint, value: string): Promise<Specification>;
  deleteSpecification(id: bigint): Promise<void>;

  // Images
  addImage(
    productId: bigint,
    url: string,
    altText?: string,
    order?: number
  ): Promise<ProductImage>;
  updateImage(id: bigint, data: Partial<ProductImage>): Promise<ProductImage>;
  deleteImage(id: bigint): Promise<void>;

  // Variants
  addVariant(data: {
    productId: bigint;
    size?: string;
    color?: string;
    fabric?: string;
    price: number;
    sku: string;
  }): Promise<ProductVariant>;
  updateVariant(
    id: bigint,
    data: Partial<ProductVariant>
  ): Promise<ProductVariant>;
  deleteVariant(id: bigint): Promise<void>;

  // Stock
  getStock(productId: bigint): Promise<Stock | null>;
  updateStock(
    productId: bigint,
    quantity: number,
    reason: string
  ): Promise<Stock>;
}
