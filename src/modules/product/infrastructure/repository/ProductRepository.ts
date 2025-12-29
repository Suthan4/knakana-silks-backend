import { inject, injectable } from "tsyringe";
import {
  Product,
  ProductVariant,
  Specification,
  ProductImage,
  Stock,
  PrismaClient,
} from "@/generated/prisma/client.js";
import { IProductRepository } from "../interface/Iproductrepository.js";

@injectable()
export class ProductRepository implements IProductRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        specifications: true,
        variants: true,
        images: { orderBy: { order: "asc" } },
        stock: true,
      },
    });
  }

  async findBySlug(slug: string): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        specifications: true,
        variants: true,
        images: { orderBy: { order: "asc" } },
        stock: true,
      },
    });
  }

  async findBySku(sku: string): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { sku },
      include: {
        category: true,
        specifications: true,
        variants: true,
        images: { orderBy: { order: "asc" } },
        stock: true,
      },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
    include?: any;
  }): Promise<Product[]> {
    return this.prisma.product.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: params.include || {
        category: true,
        images: { orderBy: { order: "asc" }, take: 1 },
        stock: true,
        _count: {
          select: { reviews: true, variants: true },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.product.count({ where });
  }

  async create(data: {
    name: string;
    slug: string;
    description: string;
    categoryId: bigint;
    basePrice: number;
    sellingPrice: number;
    sku: string;
    isActive: boolean;
    hasVariants: boolean; // ADD THIS
    hsnCode?: string;
    artisanName?: string; // Make optional
    artisanAbout?: string; // Make optional
    artisanLocation?: string; // Make optional
    metaTitle?: string;
    metaDesc?: string;
    schemaMarkup?: string;
  }): Promise<Product> {
    console.log("🔵 ProductRepository.create called with:", {
      name: data.name,
      sku: data.sku,
      categoryId: data.categoryId.toString(),
      hasVariants: data.hasVariants,
    });

    try {
      const product = await this.prisma.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          categoryId: data.categoryId,
          basePrice: data.basePrice,
          sellingPrice: data.sellingPrice,
          sku: data.sku,
          isActive: data.isActive,
          hasVariants: data.hasVariants, // ADD THIS
          hsnCode: data.hsnCode,
          artisanName: data.artisanName || "", // Default to empty string
          artisanAbout: data.artisanAbout || "", // Default to empty string
          artisanLocation: data.artisanLocation || "", // Default to empty string
          metaTitle: data.metaTitle,
          metaDesc: data.metaDesc,
          schemaMarkup: data.schemaMarkup,
        },
        include: {
          category: true,
          specifications: true,
          variants: true,
          images: true,
          stock: true,
        },
      });

      console.log("✅ Product created in database:", product.id);
      return product;
    } catch (error) {
      console.error("❌ Error in ProductRepository.create:", error);
      throw error;
    }
  }

  async update(id: bigint, data: Partial<Product>): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data,
      include: {
        category: true,
        specifications: true,
        variants: true,
        images: true,
        stock: true,
      },
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }

  // Specifications
  async addSpecification(
    productId: bigint,
    key: string,
    value: string
  ): Promise<Specification> {
    return this.prisma.specification.create({
      data: { productId, key, value },
    });
  }

  async updateSpecification(id: bigint, value: string): Promise<Specification> {
    return this.prisma.specification.update({
      where: { id },
      data: { value },
    });
  }

  async deleteSpecification(id: bigint): Promise<void> {
    await this.prisma.specification.delete({ where: { id } });
  }

  // Images
  async addImage(
    productId: bigint,
    url: string,
    altText?: string,
    order: number = 0
  ): Promise<ProductImage> {
    return this.prisma.productImage.create({
      data: { productId, url, altText, order },
    });
  }

  async updateImage(
    id: bigint,
    data: Partial<ProductImage>
  ): Promise<ProductImage> {
    return this.prisma.productImage.update({
      where: { id },
      data,
    });
  }

  async deleteImage(id: bigint): Promise<void> {
    await this.prisma.productImage.delete({ where: { id } });
  }

  // Variants
  async addVariant(data: {
    productId: bigint;
    size?: string;
    color?: string;
    fabric?: string;
    price: number;
    sku: string;
  }): Promise<ProductVariant> {
    return this.prisma.productVariant.create({
      data,
    });
  }

  async updateVariant(
    id: bigint,
    data: Partial<ProductVariant>
  ): Promise<ProductVariant> {
    return this.prisma.productVariant.update({
      where: { id },
      data,
    });
  }

  async deleteVariant(id: bigint): Promise<void> {
    await this.prisma.productVariant.delete({ where: { id } });
  }

  // Stock
  async getStock(
    productId: bigint,
    variantId: bigint,
    warehouseId: bigint
  ): Promise<Stock | null> {
    return this.prisma.stock.findUnique({
      where: {
        productId_variantId_warehouseId: {
          productId,
          variantId,
          warehouseId,
        },
      },
    });
  }

  async updateStock(
    productId: bigint,
    variantId: bigint | null,
    warehouseId: bigint,
    quantity: number,
    lowStockThreshold: number,
    reason: string
  ) {
    // Find existing stock record
    const existingStock = await this.prisma.stock.findFirst({
      where: {
        productId,
        variantId, // null will match null
        warehouseId,
      },
    });

    let stock;

    if (existingStock) {
      // Update existing
      stock = await this.prisma.stock.update({
        where: { id: existingStock.id },
        data: {
          quantity,
          lowStockThreshold,
        },
      });
    } else {
      // Create new
      stock = await this.prisma.stock.create({
        data: {
          productId,
          variantId, // null is fine here
          warehouseId,
          quantity,
          lowStockThreshold,
        },
      });
    }

    // Create adjustment record
    await this.prisma.stockAdjustment.create({
      data: {
        stockId: stock.id,
        quantity,
        reason,
      },
    });

    return stock;
  }
}
