import { inject, injectable } from "tsyringe";
import {
  Product,
  ProductVariant,
  Specification,
  ProductMedia,
  ProductVariantMedia,
  Stock,
  PrismaClient,
  Prisma,
  Category,
} from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";
import { AdminProductWithRelations, IProductRepository, PaginatedProductParams, ProductWithRelations } from "../interface/Iproductrepository.js";
import { QueryProductDTO } from "../../application/product.dto.js";

const standardProductInclude = {
  category: true,
  specifications: true,
  variants: {
    include: {
      media: { where: { isActive: true }, orderBy: { order: "asc" as const } },
      stock: true,
    },
  },
  media: { where: { isActive: true }, orderBy: { order: "asc" as const } },
  stock: true,
} as const;

const adminProductInclude = {
  category: true,
  specifications: true,
  variants: {
    include: {
      media: { orderBy: { order: "asc" as const } },
      stock: true,
    },
  },
  media: { orderBy: { order: "asc" as const } },
  stock: true,
} as const;

@injectable()
export class ProductRepository implements IProductRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx || this.prisma;
  }

  async findAllAdmin(
    params: PaginatedProductParams,
    tx?: Prisma.TransactionClient
  ): Promise<AdminProductWithRelations[]> {
    const client = this.getClient(tx);
    return client.product.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: adminProductInclude,
    });
  }

  async countAdmin(
    where?: Prisma.ProductWhereInput,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = this.getClient(tx);
    return client.product.count({ where });
  }

  async findById(
    id: bigint,
    tx?: Prisma.TransactionClient
  ): Promise<ProductWithRelations | null> {
    const client = this.getClient(tx);
    return client.product.findUnique({
      where: { id },
      include: standardProductInclude,
    });
  }

  async findBySlug(
    slug: string,
    tx?: Prisma.TransactionClient
  ): Promise<Product | null> {
    const client = this.getClient(tx);
    return client.product.findUnique({
      where: { slug },
      include: standardProductInclude,
    });
  }

  async findBySku(
    sku: string,
    tx?: Prisma.TransactionClient
  ): Promise<Product | null> {
    const client = this.getClient(tx);
    return client.product.findUnique({
      where: { sku },
      include: standardProductInclude,
    });
  }

  async findAll(
    params: {
      skip: number;
      take: number;
      where?: any;
      orderBy?: any;
      include?: any;
    },
    tx?: Prisma.TransactionClient
  ): Promise<Product[]> {
    const client = this.getClient(tx);
    return client.product.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: params.include || {
        category: true,
        media: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          take: 1,
        },
        stock: true,
        variants: {
          include: {
            media: {
              where: { isActive: true },
              orderBy: { order: "asc" },
              take: 1,
            },
            stock: true,
          },
        },
        _count: {
          select: { reviews: true, variants: true },
        },
      },
    });
  }

  async count(where?: any, tx?: Prisma.TransactionClient): Promise<number> {
    const client = this.getClient(tx);
    return client.product.count({ where });
  }

  async create(
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
  ): Promise<Product> {
    const client = this.getClient(tx);
    return client.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        categoryId: data.categoryId,
        basePrice: data.basePrice,
        sellingPrice: data.sellingPrice,
        sku: data.sku!,
        isActive: data.isActive,
        hasVariants: data.hasVariants,
        hsnCode: data.hsnCode,
        artisanName: data.artisanName || "",
        artisanAbout: data.artisanAbout || "",
        artisanLocation: data.artisanLocation || "",
        weight: data.weight,
        length: data.length,
        breadth: data.breadth,
        height: data.height,
        volumetricWeight: data.volumetricWeight,
        metaTitle: data.metaTitle,
        metaDesc: data.metaDesc,
        schemaMarkup: data.schemaMarkup,
        allowOutOfStockOrders: data.allowOutOfStockOrders ?? false,
        hasVideoConsultation: data.hasVideoConsultation ?? false,
        videoPurchasingEnabled: data.videoPurchasingEnabled ?? false,
        videoConsultationNote: data.videoConsultationNote,
      },
      include: standardProductInclude,
    });
  }

  async update(
    id: bigint,
    data: Partial<Product>,
    tx?: Prisma.TransactionClient
  ): Promise<Product> {
    const client = this.getClient(tx);
    return client.product.update({
      where: { id },
      data,
      include: standardProductInclude,
    });
  }

  async delete(id: bigint, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.product.delete({ where: { id } });
  }

  // Specifications
  async addSpecification(
    productId: bigint,
    key: string,
    value: string,
    tx?: Prisma.TransactionClient
  ): Promise<Specification> {
    const client = this.getClient(tx);
    return client.specification.create({
      data: { productId, key, value },
    });
  }

  async updateSpecification(
    id: bigint,
    value: string,
    tx?: Prisma.TransactionClient
  ): Promise<Specification> {
    const client = this.getClient(tx);
    return client.specification.update({
      where: { id },
      data: { value },
    });
  }

  async deleteSpecification(
    id: bigint,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = this.getClient(tx);
    await client.specification.delete({ where: { id } });
  }

  // UPDATED: Media methods (replaces image methods)
  async addMedia(
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
  ): Promise<ProductMedia> {
    const client = this.getClient(tx);
    return client.productMedia.create({
      data: {
        productId,
        type: data.type,
        url: data.url,
        key: data.key,
        thumbnailUrl: data.thumbnailUrl,
        altText: data.altText,
        title: data.title,
        description: data.description,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        duration: data.duration,
        width: data.width,
        height: data.height,
        order: data.order ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateMedia(
    id: bigint,
    data: Partial<ProductMedia>,
    tx?: Prisma.TransactionClient
  ): Promise<ProductMedia> {
    const client = this.getClient(tx);
    return client.productMedia.update({
      where: { id },
      data,
    });
  }

  async deleteMedia(id: bigint, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    // Soft delete - mark as inactive
    await client.productMedia.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // 🆕 ENHANCED: Variants with media, pricing, and dimensions
  async addVariant(
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
  ): Promise<ProductVariant> {
    const client = this.getClient(tx);
    return client.productVariant.create({
      data: {
        productId: data.productId,
        attributes: data.attributes,
        size: data.size,
        color: data.color,
        fabric: data.fabric,
        basePrice: data.basePrice,
        sellingPrice: data.sellingPrice,
        price: data.price,
        weight: data.weight,
        length: data.length,
        breadth: data.breadth,
        height: data.height,
        volumetricWeight: data.volumetricWeight,
        sku: data.sku,
      },
      include: {
        media: { where: { isActive: true }, orderBy: { order: "asc" } },
        stock: true,
      },
    });
  }

  async updateVariant(
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
  ): Promise<ProductVariant> {
    const client = this.getClient(tx);
    return client.productVariant.update({
      where: { id },
      data,
      include: {
        media: { where: { isActive: true }, orderBy: { order: "asc" } },
        stock: true,
      },
    });
  }

  async deleteVariant(id: bigint, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.productVariant.delete({ where: { id } });
  }

  async findVariantById(
    id: bigint,
    tx?: Prisma.TransactionClient
  ): Promise<ProductVariant | null> {
    const client = this.getClient(tx);
    return client.productVariant.findUnique({
      where: { id },
      include: {
        media: { where: { isActive: true }, orderBy: { order: "asc" } },
        stock: true,
        product: true,
      },
    });
  }

  // 🆕 Variant Media methods
  async addVariantMedia(
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
  ): Promise<ProductVariantMedia> {
    const client = this.getClient(tx);
    return client.productVariantMedia.create({
      data: {
        variantId,
        type: data.type,
        url: data.url,
        key: data.key,
        thumbnailUrl: data.thumbnailUrl,
        altText: data.altText,
        title: data.title,
        description: data.description,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        duration: data.duration,
        width: data.width,
        height: data.height,
        order: data.order ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateVariantMedia(
    id: bigint,
    data: Partial<ProductVariantMedia>,
    tx?: Prisma.TransactionClient
  ): Promise<ProductVariantMedia> {
    const client = this.getClient(tx);
    return client.productVariantMedia.update({
      where: { id },
      data,
    });
  }

  async deleteVariantMedia(
    id: bigint,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = this.getClient(tx);
    // Soft delete - mark as inactive
    await client.productVariantMedia.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Stock
  async getStock(
    productId: bigint,
    warehouseId: bigint,
    variantId: bigint | null,
    tx?: Prisma.TransactionClient
  ): Promise<Stock | null> {
    const client = this.getClient(tx);
    return client.stock.findUnique({
      where: {
        productId_variantId_warehouseId: {
          productId,
          variantId: variantId ?? null as any,
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
    reason: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = this.getClient(tx);
    const existingStock = await client.stock.findFirst({
      where: {
        productId,
        variantId: variantId ?? null,
        warehouseId,
      },
    });

    let stock;

    if (existingStock) {
      stock = await client.stock.update({
        where: { id: existingStock.id },
        data: {
          quantity,
          lowStockThreshold,
        },
      });
    } else {
      stock = await client.stock.create({
        data: {
          productId,
          variantId: variantId ?? null,
          warehouseId,
          quantity,
          lowStockThreshold,
        },
      });
    }

    await client.stockAdjustment.create({
      data: {
        stockId: stock.id,
        quantity,
        reason,
      },
    });

    return stock;
  }



/**
 * ADMIN: Recursively get all descendant IDs — includes inactive categories
 */
async getAllDescendantIdsAdmin(categoryId: bigint): Promise<bigint[]> {
  const ids: bigint[] = [categoryId];

  const children = await this.prisma.category.findMany({
    where: { parentId: categoryId },
    select: { id: true },
  });

  for (const child of children) {
    const descendantIds = await this.getAllDescendantIdsAdmin(child.id);
    ids.push(...descendantIds);
  }

  return ids;
}

}
