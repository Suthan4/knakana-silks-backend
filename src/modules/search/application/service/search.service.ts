import { injectable, inject } from "tsyringe";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";
import { ICategoryRepository } from "@/modules/category/infrastructure/interface/Icategoryrepository.js";
import { ProductSearchResult,CategorySearchResult,SearchResult,UnifiedSearchDTO, ProductWithRelations, CategoryWithParentAndCount } from "../dtos/search.dto.js";


@injectable()
export class SearchService {
  constructor(
    @inject("IProductRepository")
    private productRepository: IProductRepository,
    @inject("ICategoryRepository")
    private categoryRepository: ICategoryRepository
  ) {}

  /**
   * Unified search across products and categories
   * Implements relevance scoring based on:
   * - Exact match bonus
   * - Position in text (earlier = higher score)
   * - Name vs description match
   */
  async search(params: UnifiedSearchDTO) {
    const { query, page, limit, type = "all", includeInactive = false } = params;

    const normalizedQuery = query.toLowerCase().trim();

    let productResults: ProductSearchResult[] = [];
    let categoryResults: CategorySearchResult[] = [];

    // Search products
    if (type === "all" || type === "products") {
      productResults = await this.searchProducts(
        normalizedQuery,
        includeInactive
      );
    }

    // Search categories
    if (type === "all" || type === "categories") {
      categoryResults = await this.searchCategories(
        normalizedQuery,
        includeInactive
      );
    }

    // Combine and sort by relevance score
    const allResults: SearchResult[] = [
      ...productResults,
      ...categoryResults,
    ].sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = allResults.slice(startIndex, endIndex);

    return {
      results: paginatedResults,
      summary: {
        total: allResults.length,
        products: productResults.length,
        categories: categoryResults.length,
        query,
      },
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(allResults.length / limit),
      },
    };
  }

  /**
   * Search products with relevance scoring
   */
  private async searchProducts(
    query: string,
    includeInactive: boolean
  ): Promise<ProductSearchResult[]> {
    const products = await this.productRepository.findAll({
      skip: 0,
      take: 100, // Get more for better relevance sorting
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { sku: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        category: true,
        media: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          take: 1,
        },
        stock: true,
      },
    }) as ProductWithRelations[];

    return products.map((product) => {
      const relevanceScore = this.calculateProductRelevance(product, query);

      // Check stock availability
      const inStock =
        product.stock && product.stock.length > 0
          ? product.stock.some((s) => s.quantity > 0)
          : false;

      return {
        type: "product" as const,
        id: product.id.toString(),
        name: product.name,
        slug: product.slug,
        description: product.description || "",
        sellingPrice: Number(product.sellingPrice),
        basePrice: Number(product.basePrice),
        image: product.media && product.media[0]?.url,
        categoryName: product.category?.name,
        categorySlug: product.category?.slug,
        inStock,
        relevanceScore,
      };
    });
  }

  /**
   * Search categories with relevance scoring
   */
  private async searchCategories(
    query: string,
    includeInactive: boolean
  ): Promise<CategorySearchResult[]> {
    const categories = await this.categoryRepository.findAll({
      skip: 0,
      take: 50,
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        parent: true,
        _count: {
          select: { products: true },
        },
      },
    })as CategoryWithParentAndCount[];

    return categories.map((category) => {
      const relevanceScore = this.calculateCategoryRelevance(category, query);

      return {
        type: "category" as const,
        id: category.id.toString(),
        name: category.name,
        slug: category.slug,
        description: category.description || undefined,
        image: category.image || undefined,
        productCount: (category as any)._count?.products || 0,
        parentName: (category as any).parent?.name,
        relevanceScore,
      };
    });
  }

  /**
   * Calculate relevance score for products
   * Score range: 0-100
   */
  private calculateProductRelevance(product: any, query: string): number {
    let score = 0;

    const name = product.name.toLowerCase();
    const description = (product.description || "").toLowerCase();
    const sku = (product.sku || "").toLowerCase();

    // Exact match in name = highest score
    if (name === query) {
      score += 100;
    }
    // Starts with query in name
    else if (name.startsWith(query)) {
      score += 80;
    }
    // Contains query in name
    else if (name.includes(query)) {
      score += 60;
      // Bonus for early position
      const position = name.indexOf(query);
      score += Math.max(0, 20 - position);
    }

    // SKU match
    if (sku.includes(query)) {
      score += 40;
    }

    // Description match
    if (description.includes(query)) {
      score += 20;
      // Bonus for early position in description
      const position = description.indexOf(query);
      score += Math.max(0, 10 - position / 10);
    }

    // Stock availability bonus
    if (product.stock && product.stock.some((s: any) => s.quantity > 0)) {
      score += 10;
    }

    // Active product bonus
    if (product.isActive) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate relevance score for categories
   * Score range: 0-100
   */
  private calculateCategoryRelevance(category: any, query: string): number {
    let score = 0;

    const name = category.name.toLowerCase();
    const description = (category.description || "").toLowerCase();

    // Exact match in name
    if (name === query) {
      score += 100;
    }
    // Starts with query in name
    else if (name.startsWith(query)) {
      score += 85;
    }
    // Contains query in name
    else if (name.includes(query)) {
      score += 70;
      // Bonus for early position
      const position = name.indexOf(query);
      score += Math.max(0, 15 - position);
    }

    // Description match
    if (description.includes(query)) {
      score += 15;
    }

    // Product count bonus (categories with more products rank higher)
    const productCount = category._count?.products || 0;
    if (productCount > 0) {
      score += Math.min(20, Math.log10(productCount + 1) * 5);
    }

    // Active category bonus
    if (category.isActive) {
      score += 5;
    }

    // Root category bonus (no parent)
    if (!category.parentId) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Get search suggestions based on query
   * Returns top matching product names and category names
   */
  async getSuggestions(query: string, limit: number = 5) {
    const normalizedQuery = query.toLowerCase().trim();

    const [products, categories] = await Promise.all([
      this.productRepository.findAll({
        skip: 0,
        take: limit,
        where: {
          isActive: true,
          name: { contains: normalizedQuery, mode: "insensitive" },
        },
        orderBy: { name: "asc" },
      }),
      this.categoryRepository.findAll({
        skip: 0,
        take: limit,
        where: {
          isActive: true,
          name: { contains: normalizedQuery, mode: "insensitive" },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      products: products.map((p) => ({
        name: p.name,
        slug: p.slug,
        type: "product" as const,
      })),
      categories: categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        type: "category" as const,
      })),
    };
  }

  /**
   * Get trending searches
   * This is a placeholder - in production, track actual search queries
   */
  async getTrendingSearches(): Promise<string[]> {
    // TODO: Implement with actual analytics data
    return [
      "Kanjivaram Silk",
      "Wedding Sarees",
      "Designer Collection",
      "Pure Silk",
      "Bridal Wear",
      "Party Wear",
    ];
  }
}