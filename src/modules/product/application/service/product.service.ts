import { injectable, inject } from "tsyringe";
import { SlugUtil } from "@/shared/utils/index.js";
import { IProductRepository } from "../../infrastructure/interface/Iproductrepository.js";
import { ICategoryRepository } from "@/modules/category/infrastructure/interface/Icategoryrepository.js";
import { Product } from "@/generated/prisma/client.js";
import { Decimal } from "@prisma/client/runtime/client";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { MediaType } from "@/generated/prisma/enums.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/utils/errors.js";

@injectable()
export class ProductService {
  constructor(
    @inject("IProductRepository") private productRepository: IProductRepository,
    @inject("ICategoryRepository")
    private categoryRepository: ICategoryRepository,
    @inject("IWarehouseRepository")
    private warehouseRepository: IWarehouseRepository
  ) {}

  async createProduct(data: {
    name: string;
    description: string;
    categoryId: string;
    basePrice: number;
    sellingPrice: number;
    isActive?: boolean;
    hsnCode?: string;
    artisanName?: string;
    artisanAbout?: string;
    artisanLocation?: string;
    metaTitle?: string;
    metaDesc?: string;
    schemaMarkup?: string;
    specifications?: Array<{ key: string; value: string }>;
    media?: Array<{
      // UPDATED: Changed from images
      type: MediaType;
      url: string;
      key?: string;
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
    }>;
    variants?: Array<{
      size?: string;
      color?: string;
      fabric?: string;
      price: number;
      stock?: {
        warehouseId: string;
        quantity: number;
        lowStockThreshold?: number;
      };
    }>;
    stock?: {
      warehouseId: string;
      quantity: number;
      lowStockThreshold?: number;
    };
  }): Promise<Product | null> {
    try {
      console.log("🔵 ProductService.createProduct called");

      // Validate category
      const category = await this.categoryRepository.findById(
        BigInt(data.categoryId)
      );
      if (!category) {
        throw new NotFoundError(
          `Category with ID ${data.categoryId} not found`
        );
      }

      const hasVariants = !!(data.variants && data.variants.length > 0);

      if (hasVariants && data.stock) {
        throw new ValidationError(
          "Cannot provide both variants and direct stock."
        );
      }

      if (!hasVariants && !data.stock) {
        throw new ValidationError(
          "Simple products must have stock information."
        );
      }

      // Validate warehouses
      if (!hasVariants && data.stock) {
        const warehouse = await this.warehouseRepository.findById(
          BigInt(data.stock.warehouseId)
        );
        if (!warehouse) {
          throw new NotFoundError(
            `Warehouse with ID ${data.stock.warehouseId} not found`
          );
        }
        if (!warehouse.isActive) {
          throw new ValidationError(
            `Warehouse with ID ${data.stock.warehouseId} is inactive`
          );
        }
      }

      if (hasVariants && data.variants) {
        for (let i = 0; i < data.variants.length; i++) {
          const variant = data.variants[i];
          if (!variant?.stock) {
            throw new ValidationError(
              `Variant ${i + 1} is missing stock information`
            );
          }
          const warehouse = await this.warehouseRepository.findById(
            BigInt(variant.stock.warehouseId)
          );
          if (!warehouse) {
            throw new NotFoundError(
              `Warehouse with ID ${
                variant.stock.warehouseId
              } not found for variant ${i + 1}`
            );
          }
          if (!warehouse.isActive) {
            throw new ValidationError(
              `Warehouse with ID ${
                variant.stock.warehouseId
              } is inactive for variant ${i + 1}`
            );
          }
        }
      }

      const slug = SlugUtil.generateSlug(data.name);
      const sku = this.generateSKU(data.name);

      const [existingSlug, existingSku] = await Promise.all([
        this.productRepository.findBySlug(slug),
        this.productRepository.findBySku(sku),
      ]);

      if (existingSlug) {
        throw new ConflictError(
          `Product with name "${data.name}" already exists`
        );
      }

      if (existingSku) {
        const newSku = this.generateSKU(data.name + "-" + Date.now());
        return this.createProductWithSku(data, slug, newSku, hasVariants);
      }

      return this.createProductWithSku(data, slug, sku, hasVariants);
    } catch (error) {
      console.error("❌ Error in ProductService.createProduct:", error);
      throw error;
    }
  }

  private async createProductWithSku(
    data: any,
    slug: string,
    sku: string,
    hasVariants: boolean
  ): Promise<Product | null> {
    try {
      const product = await this.productRepository.create({
        name: data.name,
        slug,
        description: data.description,
        categoryId: BigInt(data.categoryId),
        basePrice: data.basePrice,
        sellingPrice: data.sellingPrice,
        sku,
        isActive: data.isActive ?? true,
        hasVariants,
        hsnCode: data.hsnCode,
        artisanName: data.artisanName || "",
        artisanAbout: data.artisanAbout || "",
        artisanLocation: data.artisanLocation || "",
        metaTitle: data.metaTitle,
        metaDesc: data.metaDesc,
        schemaMarkup: data.schemaMarkup,
      });

      // Add specifications
      if (data.specifications?.length) {
        await Promise.all(
          data.specifications.map((spec: any) =>
            this.productRepository.addSpecification(
              product.id,
              spec.key,
              spec.value
            )
          )
        );
      }

      // UPDATED: Add media (replaces images)
      if (data.media?.length) {
        await Promise.all(
          data.media.map((mediaItem: any) =>
            this.productRepository.addMedia(product.id, {
              type: mediaItem.type || MediaType.IMAGE,
              url: mediaItem.url,
              key: mediaItem.key,
              thumbnailUrl: mediaItem.thumbnailUrl,
              altText: mediaItem.altText,
              title: mediaItem.title,
              description: mediaItem.description,
              mimeType: mediaItem.mimeType,
              fileSize: mediaItem.fileSize
                ? BigInt(mediaItem.fileSize)
                : undefined,
              duration: mediaItem.duration,
              width: mediaItem.width,
              height: mediaItem.height,
              order: mediaItem.order,
              isActive: mediaItem.isActive,
            })
          )
        );
      }

      // Handle stock
      if (hasVariants) {
        for (const variant of data.variants!) {
          const variantSku = this.generateSKU(
            `${data.name}-${variant.size || ""}-${variant.color || ""}-${
              variant.fabric || ""
            }`
          );

          const createdVariant = await this.productRepository.addVariant({
            productId: product.id,
            size: variant.size,
            color: variant.color,
            fabric: variant.fabric,
            price: variant.price,
            sku: variantSku,
          });

          if (variant.stock) {
            await this.productRepository.updateStock(
              product.id,
              createdVariant.id,
              BigInt(variant.stock.warehouseId),
              variant.stock.quantity,
              variant.stock.lowStockThreshold || 10,
              "Initial variant stock"
            );
          }
        }
      } else {
        await this.productRepository.updateStock(
          product.id,
          null,
          BigInt(data.stock!.warehouseId),
          data.stock!.quantity,
          data.stock!.lowStockThreshold || 10,
          "Initial product stock"
        );
      }

      return await this.productRepository.findById(product.id);
    } catch (error) {
      console.error("❌ Error in createProductWithSku:", error);
      throw error;
    }
  }

  async updateProduct(
    id: string,
    data: {
      name?: string;
      description?: string;
      categoryId?: string;
      basePrice?: number;
      sellingPrice?: number;
      isActive?: boolean;
      hsnCode?: string;
      metaTitle?: string;
      metaDesc?: string;
      schemaMarkup?: string;
    }
  ): Promise<Product> {
    const productId = BigInt(id);
    const product = await this.productRepository.findById(productId);

    if (!product) {
      throw new Error("Product not found");
    }

    if (data.categoryId) {
      const category = await this.categoryRepository.findById(
        BigInt(data.categoryId)
      );
      if (!category) {
        throw new Error("Category not found");
      }
    }

    let slug = product.slug;
    if (data.name && data.name !== product.name) {
      slug = SlugUtil.generateSlug(data.name);
      const existing = await this.productRepository.findBySlug(slug);
      if (existing && existing.id !== productId) {
        throw new Error("Product with this name already exists");
      }
    }

    const updateData: any = {
      ...data,
      slug,
      categoryId: data.categoryId ? BigInt(data.categoryId) : undefined,
    };

    if (data.basePrice !== undefined) {
      updateData.basePrice = new Decimal(data.basePrice);
    }

    if (data.sellingPrice !== undefined) {
      updateData.sellingPrice = new Decimal(data.sellingPrice);
    }

    return await this.productRepository.update(productId, updateData);
  }

  async deleteProduct(id: string) {
    await this.productRepository.delete(BigInt(id));
  }

  async getProduct(id: string) {
    const product = await this.productRepository.findById(BigInt(id));
    if (!product) {
      throw new Error("Product not found");
    }
    return product;
  }

  async getProductBySlug(slug: string) {
    const product = await this.productRepository.findBySlug(slug);
    if (!product) {
      throw new Error("Product not found");
    }
    return product;
  }

  async getProducts(params: {
    page: number;
    limit: number;
    search?: string;
    categoryId?: string;
    isActive?: boolean;
    hasVariants?: boolean;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { sku: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.categoryId) {
      where.categoryId = BigInt(params.categoryId);
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.hasVariants !== undefined) {
      where.hasVariants = params.hasVariants;
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.sellingPrice = {};
      if (params.minPrice !== undefined) {
        where.sellingPrice.gte = params.minPrice;
      }
      if (params.maxPrice !== undefined) {
        where.sellingPrice.lte = params.maxPrice;
      }
    }

    const orderBy: any = {};
    if (params.sortBy === "price") {
      orderBy.sellingPrice = params.sortOrder || "asc";
    } else {
      orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";
    }

    const [products, total] = await Promise.all([
      this.productRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.productRepository.count(where),
    ]);

    return {
      products,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  // Stock methods
  async getStock(productId: string, warehouseId: string, variantId?: string) {
    return this.productRepository.getStock(
      BigInt(productId),
      BigInt(warehouseId),
      variantId ? BigInt(variantId) : null
    );
  }

  async updateStock(
    productId: string,
    variantId: string | null,
    warehouseId: string,
    quantity: number,
    lowStockThreshold: number,
    reason: string
  ) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    if (product.hasVariants && !variantId) {
      throw new Error(
        "This product has variants. You must specify a variantId."
      );
    }

    if (!product.hasVariants && variantId) {
      throw new Error(
        "This product has no variants. Do not specify a variantId."
      );
    }

    return this.productRepository.updateStock(
      BigInt(productId),
      variantId ? BigInt(variantId) : null,
      BigInt(warehouseId),
      quantity,
      lowStockThreshold,
      reason
    );
  }

  // Specification methods
  async addSpecification(productId: string, key: string, value: string) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }
    return this.productRepository.addSpecification(
      BigInt(productId),
      key,
      value
    );
  }

  async updateSpecification(id: string, value: string) {
    return this.productRepository.updateSpecification(BigInt(id), value);
  }

  async deleteSpecification(id: string) {
    await this.productRepository.deleteSpecification(BigInt(id));
  }

  // UPDATED: Media methods (replaces image methods)
  async addMedia(
    productId: string,
    data: {
      type: MediaType;
      url: string;
      key?: string;
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
  ) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    return this.productRepository.addMedia(BigInt(productId), {
      ...data,
      fileSize: data.fileSize ? BigInt(data.fileSize) : undefined,
    });
  }

  async deleteMedia(id: string) {
    await this.productRepository.deleteMedia(BigInt(id));
  }

  // Variant methods
  async addVariant(
    productId: string,
    data: {
      size?: string;
      color?: string;
      fabric?: string;
      price: number;
      stock?: {
        warehouseId: string;
        quantity: number;
        lowStockThreshold?: number;
      };
    }
  ) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    if (!product.hasVariants) {
      throw new Error("Cannot add variants to a simple product");
    }

    const sku = this.generateSKU(
      `${product.name}-${data.size || ""}-${data.color || ""}-${
        data.fabric || ""
      }`
    );

    const variant = await this.productRepository.addVariant({
      productId: BigInt(productId),
      ...data,
      sku,
    });

    if (data.stock) {
      await this.productRepository.updateStock(
        BigInt(productId),
        variant.id,
        BigInt(data.stock.warehouseId),
        data.stock.quantity,
        data.stock.lowStockThreshold || 10,
        "Initial variant stock"
      );
    }

    return variant;
  }

  async deleteVariant(id: string) {
    await this.productRepository.deleteVariant(BigInt(id));
  }

  private generateSKU(name: string): string {
    const slug = SlugUtil.generateSlug(name).substring(0, 10).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${slug}-${random}`;
  }
}
