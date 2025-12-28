import { injectable, inject } from "tsyringe";
import { SlugUtil, NumberUtil } from "@/shared/utils/index.js";
import { IProductRepository } from "../../infrastructure/interface/Iproductrepository.js";
import { ICategoryRepository } from "@/modules/category/infrastructure/interface/Icategoryrepository.js";
import { Product } from "@/generated/prisma/client.js";
import { Decimal } from "@prisma/client/runtime/client";

@injectable()
export class ProductService {
  constructor(
    @inject("IProductRepository") private productRepository: IProductRepository,
    @inject("ICategoryRepository")
    private categoryRepository: ICategoryRepository
  ) {}

  async createProduct(data: {
    name: string;
    description: string;
    categoryId: string;
    basePrice: number;
    sellingPrice: number;
    isActive?: boolean;
    artisanName?: string;
    artisanAbout?: string;
    artisanLocation?: string;
    metaTitle?: string;
    metaDesc?: string;
    schemaMarkup?: string;
    specifications?: Array<{ key: string; value: string }>;
    images?: Array<{ url: string; altText?: string; order?: number }>;
    variants?: Array<{
      size?: string;
      color?: string;
      fabric?: string;
      price: number;
    }>;
    stock?: { quantity: number; lowStockThreshold?: number };
  }): Promise<Product | null> {
    try {
      console.log("🔵 ProductService.createProduct called with:", {
        name: data.name,
        categoryId: data.categoryId,
        basePrice: data.basePrice,
        sellingPrice: data.sellingPrice,
      });

      // Validate category
      const category = await this.categoryRepository.findById(
        BigInt(data.categoryId)
      );
      if (!category) {
        throw new Error("Category not found");
      }
      console.log("✅ Category validated:", category.name);

      // Generate slug and SKU
      const slug = SlugUtil.generateSlug(data.name);
      const sku = this.generateSKU(data.name);
      console.log("✅ Generated slug:", slug, "SKU:", sku);

      // Check if slug or SKU exists
      const [existingSlug, existingSku] = await Promise.all([
        this.productRepository.findBySlug(slug),
        this.productRepository.findBySku(sku),
      ]);

      if (existingSlug) {
        throw new Error("Product with this name already exists");
      }

      if (existingSku) {
        // Regenerate SKU with timestamp to avoid collision
        const newSku = this.generateSKU(data.name + "-" + Date.now());
        console.log("⚠️ SKU collision detected, using new SKU:", newSku);
        return this.createProductWithSku(data, slug, newSku);
      }

      return this.createProductWithSku(data, slug, sku);
    } catch (error) {
      console.error("❌ Error in ProductService.createProduct:", error);
      throw error;
    }
  }

  private async createProductWithSku(
    data: {
      name: string;
      description: string;
      categoryId: string;
      basePrice: number;
      sellingPrice: number;
      isActive?: boolean;
      artisanName?: string;
      artisanAbout?: string;
      artisanLocation?: string;
      metaTitle?: string;
      metaDesc?: string;
      schemaMarkup?: string;
      specifications?: Array<{ key: string; value: string }>;
      images?: Array<{ url: string; altText?: string; order?: number }>;
      variants?: Array<{
        size?: string;
        color?: string;
        fabric?: string;
        price: number;
      }>;
      stock?: { quantity: number; lowStockThreshold?: number };
    },
    slug: string,
    sku: string
  ): Promise<Product | null> {
    try {
      console.log("🔵 Creating product with slug:", slug, "sku:", sku);

      // Create product
      const product = await this.productRepository.create({
        name: data.name,
        slug,
        description: data.description,
        categoryId: BigInt(data.categoryId),
        basePrice: data.basePrice,
        sellingPrice: data.sellingPrice,
        sku,
        isActive: data.isActive ?? true,
        artisanName: data.artisanName || "",
        artisanAbout: data.artisanAbout || "",
        artisanLocation: data.artisanLocation || "",
        metaTitle: data.metaTitle,
        metaDesc: data.metaDesc,
        schemaMarkup: data.schemaMarkup,
      });

      console.log("✅ Product created with ID:", product.id);

      // Add specifications
      if (data.specifications && data.specifications.length > 0) {
        console.log("🔵 Adding specifications:", data.specifications.length);
        await Promise.all(
          data.specifications.map((spec) =>
            this.productRepository.addSpecification(
              product.id,
              spec.key,
              spec.value
            )
          )
        );
        console.log("✅ Specifications added");
      }

      // Add images
      if (data.images && data.images.length > 0) {
        console.log("🔵 Adding images:", data.images.length);
        await Promise.all(
          data.images.map((img) =>
            this.productRepository.addImage(
              product.id,
              img.url,
              img.altText,
              img.order
            )
          )
        );
        console.log("✅ Images added");
      }

      // Add variants
      if (data.variants && data.variants.length > 0) {
        console.log("🔵 Adding variants:", data.variants.length);
        await Promise.all(
          data.variants.map((variant) => {
            const variantSku = this.generateSKU(
              `${data.name}-${variant.size || ""}-${variant.color || ""}`
            );
            return this.productRepository.addVariant({
              productId: product.id,
              size: variant.size,
              color: variant.color,
              fabric: variant.fabric,
              price: variant.price,
              sku: variantSku,
            });
          })
        );
        console.log("✅ Variants added");
      }

      // Initialize stock
      if (data.stock) {
        console.log("🔵 Initializing stock:", data.stock.quantity);
        await this.productRepository.updateStock(
          product.id,
          data.stock.quantity,
          "Initial stock"
        );
        console.log("✅ Stock initialized");
      }

      // Return product with all relations
      const finalProduct = await this.productRepository.findById(product.id);
      console.log("✅ Product creation complete:", finalProduct?.id);
      return finalProduct;
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

    // Validate category if changed
    if (data.categoryId) {
      const category = await this.categoryRepository.findById(
        BigInt(data.categoryId)
      );
      if (!category) {
        throw new Error("Category not found");
      }
    }

    // Generate new slug if name changed
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
    const updated = await this.productRepository.update(productId, updateData);

    return updated;
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

  // Image methods
  async addImage(
    productId: string,
    url: string,
    altText?: string,
    order?: number
  ) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    return this.productRepository.addImage(
      BigInt(productId),
      url,
      altText,
      order
    );
  }

  async deleteImage(id: string) {
    await this.productRepository.deleteImage(BigInt(id));
  }

  // Variant methods
  async addVariant(
    productId: string,
    data: {
      size?: string;
      color?: string;
      fabric?: string;
      price: number;
    }
  ) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    const sku = this.generateSKU(
      `${product.name}-${data.size || ""}-${data.color || ""}-${
        data.fabric || ""
      }`
    );

    return this.productRepository.addVariant({
      productId: BigInt(productId),
      ...data,
      sku,
    });
  }

  async deleteVariant(id: string) {
    await this.productRepository.deleteVariant(BigInt(id));
  }

  // Stock methods
  async getStock(productId: string) {
    return this.productRepository.getStock(BigInt(productId));
  }

  async updateStock(productId: string, quantity: number, reason: string) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new Error("Product not found");
    }

    return this.productRepository.updateStock(
      BigInt(productId),
      quantity,
      reason
    );
  }

  // Helper method to generate SKU
  private generateSKU(name: string): string {
    const slug = SlugUtil.generateSlug(name).substring(0, 10).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${slug}-${random}`;
  }
}
