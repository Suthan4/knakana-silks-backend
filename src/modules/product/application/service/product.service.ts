import { injectable, inject } from "tsyringe";
import { SlugUtil } from "@/shared/utils/index.js";
import { IProductRepository } from "../../infrastructure/interface/Iproductrepository.js";
import { ICategoryRepository } from "@/modules/category/infrastructure/interface/Icategoryrepository.js";
import { Product, ProductVariant } from "@/generated/prisma/client.js";
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
    sku?: string;
    isActive?: boolean;
    hsnCode?: string;
    artisanName?: string;
    artisanAbout?: string;
    artisanLocation?: string;
    weight: number;
    length: number;
    breadth: number;
    height: number;
    metaTitle?: string;
    metaDesc?: string;
    schemaMarkup?: string;
    specifications?: Array<{ key: string; value: string }>;
    media?: Array<{
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
      media?: Array<{
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

      // 🆕 Calculate volumetric weight
      const volumetricWeight =
        (data.length * data.breadth * data.height) / 5000;

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

      // 🆕 Handle SKU - use provided SKU or auto-generate
      let sku: string;
      if (data.sku) {
        // Validate provided SKU is not already in use
        const existingSku = await this.productRepository.findBySku(data.sku);
        if (existingSku) {
          throw new ConflictError(`SKU "${data.sku}" is already in use`);
        }
        sku = data.sku;
      } else {
        // Auto-generate SKU
        sku = this.generateSKU(data.name);
        const existingSku = await this.productRepository.findBySku(sku);
        if (existingSku) {
          sku = this.generateSKU(data.name + "-" + Date.now());
        }
      }

      const existingSlug = await this.productRepository.findBySlug(slug);
      if (existingSlug) {
        throw new ConflictError(
          `Product with name "${data.name}" already exists`
        );
      }

      return this.createProductWithSku(
        data,
        slug,
        sku,
        hasVariants,
        volumetricWeight
      );
    } catch (error) {
      console.error("❌ Error in ProductService.createProduct:", error);
      throw error;
    }
  }

  private async createProductWithSku(
    data: any,
    slug: string,
    sku: string,
    hasVariants: boolean,
    volumetricWeight: number
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
        weight: data.weight,
        length: data.length,
        breadth: data.breadth,
        height: data.height,
        volumetricWeight,
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

      // Add product-level media
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

      // Handle variants with media, pricing, and dimensions
      if (hasVariants) {
        for (const variant of data.variants!) {
          // Generate variant SKU
          const variantSku = this.generateSKU(
            `${data.name}-${variant.size || ""}-${variant.color || ""}-${
              variant.fabric || ""
            }-${JSON.stringify(variant.attributes || {})}`
          );

          // 🆕 Calculate variant-specific volumetric weight if dimensions provided
          let variantVolumetricWeight: number | undefined;
          if (
            variant.weight &&
            variant.length &&
            variant.breadth &&
            variant.height
          ) {
            variantVolumetricWeight =
              (variant.length * variant.breadth * variant.height) / 5000;
          }

          // Create variant with all new features
          const createdVariant = await this.productRepository.addVariant({
            productId: product.id,
            attributes: variant.attributes,
            size: variant.size,
            color: variant.color,
            fabric: variant.fabric,
            basePrice: variant.basePrice,
            sellingPrice: variant.sellingPrice,
            price: variant.price,
            weight: variant.weight,
            length: variant.length,
            breadth: variant.breadth,
            height: variant.height,
            volumetricWeight: variantVolumetricWeight,
            sku: variantSku,
          });

          // 🆕 Add variant-specific media
          if (variant.media?.length) {
            await Promise.all(
              variant.media.map((mediaItem: any) =>
                this.productRepository.addVariantMedia(createdVariant.id, {
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

          // Add stock
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
        // Simple product stock
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

  // Continuation of ProductService class...

  async updateProduct(
    id: string,
    data: {
      name?: string;
      description?: string;
      categoryId?: string;
      basePrice?: number;
      sellingPrice?: number;
      sku?: string;
      isActive?: boolean;
      hsnCode?: string;
      artisanName?: string;
      artisanAbout?: string;
      artisanLocation?: string;
      weight?: number;
      length?: number;
      breadth?: number;
      height?: number;
      metaTitle?: string;
      metaDesc?: string;
      schemaMarkup?: string;
    }
  ): Promise<Product> {
    const productId = BigInt(id);
    const product = await this.productRepository.findById(productId);

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (data.categoryId) {
      const category = await this.categoryRepository.findById(
        BigInt(data.categoryId)
      );
      if (!category) {
        throw new NotFoundError("Category not found");
      }
    }

    let slug = product.slug;
    if (data.name && data.name !== product.name) {
      slug = SlugUtil.generateSlug(data.name);
      const existing = await this.productRepository.findBySlug(slug);
      if (existing && existing.id !== productId) {
        throw new ConflictError("Product with this name already exists");
      }
    }

    // Validate SKU if provided
    if (data.sku && data.sku !== product.sku) {
      const existingSku = await this.productRepository.findBySku(data.sku);
      if (existingSku && existingSku.id !== productId) {
        throw new ConflictError(`SKU "${data.sku}" is already in use`);
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

    // Calculate volumetric weight if dimensions are updated
    if (data.weight || data.length || data.breadth || data.height) {
      const weight = data.weight ?? Number(product.weight);
      const length = data.length ?? Number(product.length);
      const breadth = data.breadth ?? Number(product.breadth);
      const height = data.height ?? Number(product.height);

      updateData.volumetricWeight = (length * breadth * height) / 5000;
    }

    return await this.productRepository.update(productId, updateData);
  }

  async deleteProduct(id: string) {
    await this.productRepository.delete(BigInt(id));
  }

  async getProduct(id: string) {
    const product = await this.productRepository.findById(BigInt(id));
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async getProductBySlug(slug: string) {
    const product = await this.productRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async getProducts(params: {
    page: number;
    limit: number;
    search?: string;
    categorySlug?: string;
    categoryId?: string;
    categoryIds?: string[];
    isActive?: boolean;
    hasVariants?: boolean;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: "createdAt" | "price" | "name" | "popularity";
    sortOrder?: "asc" | "desc";
    color?: string;
    fabric?: string;
    size?: string;
    artisan?: string;
    inStock?: boolean;
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

    if (params.categoryIds && params.categoryIds.length > 0) {
      where.categoryId = {
        in: params.categoryIds.map((id) => BigInt(id)),
      };
    } else if (params.categoryId) {
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

    if (params.color || params.fabric || params.size) {
      where.variants = {
        some: {
          ...(params.color && {
            color: {
              contains: params.color,
              mode: "insensitive",
            },
          }),
          ...(params.fabric && {
            fabric: {
              contains: params.fabric,
              mode: "insensitive",
            },
          }),
          ...(params.size && {
            size: {
              contains: params.size,
              mode: "insensitive",
            },
          }),
        },
      };
    }

    if (params.artisan) {
      where.artisanName = {
        contains: params.artisan,
        mode: "insensitive",
      };
    }

    if (params.inStock !== undefined && params.inStock) {
      where.stock = {
        some: {
          quantity: {
            gt: 0,
          },
        },
      };
    }

    const orderBy: any = {};

    if (params.sortBy === "price") {
      orderBy.sellingPrice = params.sortOrder || "asc";
    } else if (params.sortBy === "name") {
      orderBy.name = params.sortOrder || "asc";
    } else if (params.sortBy === "popularity") {
      orderBy._count = {
        reviews: params.sortOrder || "desc",
      };
    } else {
      orderBy.createdAt = params.sortOrder || "desc";
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
      throw new NotFoundError("Product not found");
    }

    if (product.hasVariants && !variantId) {
      throw new ValidationError(
        "This product has variants. You must specify a variantId."
      );
    }

    if (!product.hasVariants && variantId) {
      throw new ValidationError(
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
      throw new NotFoundError("Product not found");
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

  // Product Media methods
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
      throw new NotFoundError("Product not found");
    }

    return this.productRepository.addMedia(BigInt(productId), {
      ...data,
      fileSize: data.fileSize ? BigInt(data.fileSize) : undefined,
    });
  }

  async deleteMedia(id: string) {
    await this.productRepository.deleteMedia(BigInt(id));
  }

  // 🆕 ENHANCED: Variant methods with media, pricing, and dimensions
  async addVariant(
    productId: string,
    data: {
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
      media?: Array<{
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
      stock?: {
        warehouseId: string;
        quantity: number;
        lowStockThreshold?: number;
      };
    }
  ): Promise<ProductVariant> {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (!product.hasVariants) {
      throw new ValidationError("Cannot add variants to a simple product");
    }

    // Generate variant SKU
    const sku = this.generateSKU(
      `${product.name}-${data.size || ""}-${data.color || ""}-${
        data.fabric || ""
      }-${JSON.stringify(data.attributes || {})}`
    );

    // Calculate variant-specific volumetric weight if dimensions provided
    let volumetricWeight: number | undefined;
    if (data.weight && data.length && data.breadth && data.height) {
      volumetricWeight = (data.length * data.breadth * data.height) / 5000;
    }

    // Create variant
    const variant = await this.productRepository.addVariant({
      productId: BigInt(productId),
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
      volumetricWeight,
      sku,
    });

    // Add variant-specific media
    if (data.media?.length) {
      await Promise.all(
        data.media.map((mediaItem: any) =>
          this.productRepository.addVariantMedia(variant.id, {
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

    // Add stock
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

  async updateVariant(
    id: string,
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
    }
  ): Promise<ProductVariant> {
    const variant = await this.productRepository.findVariantById(BigInt(id));
    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    // Calculate volumetric weight if dimensions are updated
    let volumetricWeight: number | undefined;
    if (data.weight || data.length || data.breadth || data.height) {
      const weight = data.weight ?? Number(variant.weight);
      const length = data.length ?? Number(variant.length);
      const breadth = data.breadth ?? Number(variant.breadth);
      const height = data.height ?? Number(variant.height);

      if (weight && length && breadth && height) {
        volumetricWeight = (length * breadth * height) / 5000;
      }
    }

    return await this.productRepository.updateVariant(BigInt(id), {
      ...data,
      volumetricWeight,
    });
  }

  async deleteVariant(id: string) {
    await this.productRepository.deleteVariant(BigInt(id));
  }

  async getVariant(id: string): Promise<ProductVariant> {
    const variant = await this.productRepository.findVariantById(BigInt(id));
    if (!variant) {
      throw new NotFoundError("Variant not found");
    }
    return variant;
  }

  // 🆕 Variant Media methods
  async addVariantMedia(
    variantId: string,
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
    const variant = await this.productRepository.findVariantById(
      BigInt(variantId)
    );
    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    return this.productRepository.addVariantMedia(BigInt(variantId), {
      ...data,
      fileSize: data.fileSize ? BigInt(data.fileSize) : undefined,
    });
  }

  async deleteVariantMedia(id: string) {
    await this.productRepository.deleteVariantMedia(BigInt(id));
  }

  private generateSKU(name: string): string {
    const slug = SlugUtil.generateSlug(name).substring(0, 10).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${slug}-${random}`;
  }
}