import { cacheService } from "@/cache/cache.service.js";
import { CacheKeys, CachePatterns } from "@/cache/cache.keys.js";

/**
 * 🧩 Module-Level Cache Management
 * 
 * Provides high-level cache invalidation strategies:
 * - Clear entire module cache
 * - Clear specific patterns
 * - Clear related caches on entity changes
 * 
 * Use Cases:
 * ✅ Single product updated → Clear that product + lists
 * ✅ Bulk import → Clear entire module
 * ✅ Schema change → Clear entire module
 * ✅ Category hierarchy changed → Clear categories + affected products
 */

export const CacheModule = {
  /**
   * 📦 PRODUCT MODULE CACHE OPERATIONS
   */
  product: {
    /**
     * Clear all product-related cache
     * Use: Bulk import, schema changes, major updates
     */
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL product cache...");
      await cacheService.delByPattern(CachePatterns.product.all);
    },

    /**
     * Clear single product cache (detail + slug)
     * Use: Product updated, deleted
     */
    async clearProduct(id: string | number, slug?: string): Promise<void> {
      console.log(`🧹 Clearing product cache for ID: ${id}`);
      const keys = [CacheKeys.product.detail(id)];
      
      if (slug) {
        keys.push(CacheKeys.product.detailBySlug(slug));
      }
      
      await cacheService.delMultiple(keys);
    },

    /**
     * Clear product lists
     * Use: Product created, updated, deleted
     */
    async clearLists(): Promise<void> {
      console.log("🧹 Clearing all product lists...");
      await cacheService.delByPattern(CachePatterns.product.lists);
    },

    /**
     * Clear category-specific product caches
     * Use: Category updated, products moved to different category
     */
    async clearByCategory(categorySlug: string): Promise<void> {
      console.log(`🧹 Clearing product cache for category: ${categorySlug}`);
      await cacheService.delByPattern(CachePatterns.product.byCategory(categorySlug));
      await this.clearLists(); // Lists might filter by category
    },

    /**
     * Clear product stock cache
     * Use: Stock updated
     */
    async clearStock(productId: string | number): Promise<void> {
      console.log(`🧹 Clearing stock cache for product: ${productId}`);
      await cacheService.delByPattern(`product:stock:${productId}*`);
    },

    /**
     * Clear variant cache
     * Use: Variant added, updated, deleted
     */
    async clearVariants(productId: string | number): Promise<void> {
      console.log(`🧹 Clearing variants cache for product: ${productId}`);
      const keys = [
        CacheKeys.product.variants(productId),
      ];
      await cacheService.delMultiple(keys);
      await cacheService.delByPattern(`product:variant:${productId}*`);
    },

    /**
     * Clear featured/special lists
     * Use: Featured products updated
     */
    async clearSpecialLists(): Promise<void> {
      console.log("🧹 Clearing featured/special product lists...");
      const keys = [
        CacheKeys.product.featured(),
        CacheKeys.product.newArrivals(),
        CacheKeys.product.bestSellers(),
      ];
      await cacheService.delMultiple(keys);
    },

    /**
     * Complete product update cache strategy
     * Clears: detail + lists + category + related
     */
    async onProductUpdate(id: string | number, slug: string, categorySlug?: string): Promise<void> {
      console.log(`🧹 Product update cache clear for: ${id}`);
      
      // Clear product detail
      await this.clearProduct(id, slug);
      
      // Clear lists (pagination might show this product)
      await this.clearLists();
      
      // Clear category cache if provided
      if (categorySlug) {
        await this.clearByCategory(categorySlug);
      }
      
      // Clear special lists in case this product was featured
      await this.clearSpecialLists();
    },

    /**
     * Product creation cache strategy
     * Clears: lists + category + special lists
     */
    async onProductCreate(categorySlug: string): Promise<void> {
      console.log(`🧹 Product creation cache clear`);
      
      await this.clearLists();
      await this.clearByCategory(categorySlug);
      await this.clearSpecialLists();
    },

    /**
     * Product deletion cache strategy
     * Clears: everything related to the product
     */
    async onProductDelete(id: string | number, slug: string, categorySlug: string): Promise<void> {
      console.log(`🧹 Product deletion cache clear for: ${id}`);
      
      // Clear everything related to this product
      await this.clearProduct(id, slug);
      await this.clearVariants(id);
      await this.clearStock(id);
      await cacheService.delByPattern(`product:*:${id}*`);
      
      // Clear lists and category
      await this.clearLists();
      await this.clearByCategory(categorySlug);
      await this.clearSpecialLists();
    },
  },

  /**
   * 📁 CATEGORY MODULE CACHE OPERATIONS
   */
  category: {
    /**
     * Clear all category-related cache
     * Use: Category hierarchy restructured, bulk updates
     */
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL category cache...");
      await cacheService.delByPattern(CachePatterns.category.all);
    },

    /**
     * Clear single category cache
     * Use: Category updated, deleted
     */
    async clearCategory(id: string | number, slug?: string): Promise<void> {
      console.log(`🧹 Clearing category cache for ID: ${id}`);
      const keys = [CacheKeys.category.detail(id)];
      
      if (slug) {
        keys.push(
          CacheKeys.category.detailBySlug(slug),
          CacheKeys.category.withDescendants(slug)
        );
      }
      
      await cacheService.delMultiple(keys);
    },

    /**
     * Clear category tree cache
     * Use: Category created, updated, deleted, moved
     */
    async clearTree(): Promise<void> {
      console.log("🧹 Clearing category tree cache...");
      await cacheService.delByPattern(CachePatterns.category.trees);
      await cacheService.del(CacheKeys.category.rootCategories());
    },

    /**
     * Clear category lists
     * Use: Category created, updated, deleted
     */
    async clearLists(): Promise<void> {
      console.log("🧹 Clearing category lists...");
      await cacheService.delByPattern(CachePatterns.category.lists);
    },

    /**
     * Complete category update cache strategy
     * Clears: category + tree + lists + related products
     */
    async onCategoryUpdate(id: string | number, slug: string): Promise<void> {
      console.log(`🧹 Category update cache clear for: ${id}`);
      
      // Clear category itself
      await this.clearCategory(id, slug);
      
      // Clear tree (structure might have changed)
      await this.clearTree();
      
      // Clear lists
      await this.clearLists();
      
      // Clear related products
      await CacheModule.product.clearByCategory(slug);
    },

    /**
     * Category creation cache strategy
     */
    async onCategoryCreate(): Promise<void> {
      console.log(`🧹 Category creation cache clear`);
      
      await this.clearTree();
      await this.clearLists();
    },

    /**
     * Category deletion cache strategy
     */
    async onCategoryDelete(id: string | number, slug: string): Promise<void> {
      console.log(`🧹 Category deletion cache clear for: ${id}`);
      
      // Clear everything related to this category
      await this.clearCategory(id, slug);
      await this.clearTree();
      await this.clearLists();
      
      // Clear related products
      await CacheModule.product.clearByCategory(slug);
    },

    /**
     * Category hierarchy change strategy
     * Use: Parent changed, order changed, bulk restructure
     */
    async onHierarchyChange(): Promise<void> {
      console.log(`🧹 Category hierarchy change - clearing all category cache`);
      
      // Safest approach: clear everything
      await this.clearAll();
      
      // Also clear product lists as category filtering might be affected
      await CacheModule.product.clearLists();
    },
  },

  /**
   * 🏠 HOME MODULE CACHE OPERATIONS
   */
  home: {
    /**
     * Clear all home page cache
     */
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL home cache...");
      await cacheService.delByPattern(CachePatterns.home.all);
    },

    /**
     * Clear sections
     */
    async clearSections(): Promise<void> {
      console.log("🧹 Clearing home sections cache...");
      await cacheService.del(CacheKeys.home.sections());
    },

    /**
     * Clear banners
     */
    async clearBanners(): Promise<void> {
      console.log("🧹 Clearing home banners cache...");
      await cacheService.del(CacheKeys.home.banners());
    },
  },

  /**
   * 👤 USER MODULE CACHE OPERATIONS
   */
  user: {
    /**
     * Clear all user cache
     */
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL user cache...");
      await cacheService.delByPattern(CachePatterns.user.all);
    },

    /**
     * Clear single user cache
     */
    async clearUser(id: string | number): Promise<void> {
      console.log(`🧹 Clearing user cache for ID: ${id}`);
      await cacheService.delByPattern(`user:*:${id}*`);
    },

    /**
     * Clear user cart
     */
    async clearCart(userId: string | number): Promise<void> {
      console.log(`🧹 Clearing cart cache for user: ${userId}`);
      await cacheService.del(CacheKeys.user.cart(userId));
    },

    /**
     * Clear user wishlist
     */
    async clearWishlist(userId: string | number): Promise<void> {
      console.log(`🧹 Clearing wishlist cache for user: ${userId}`);
      await cacheService.del(CacheKeys.user.wishlist(userId));
    },
  },

  /**
   * 🧹 GLOBAL CACHE OPERATIONS
   */
  global: {
    /**
     * Clear everything (nuclear option)
     * Use: Major deployment, schema changes, migrations
     */
    async clearAll(): Promise<void> {
      console.warn("⚠️  NUCLEAR OPTION: Clearing ALL cache...");
      await cacheService.flushAll();
    },

    /**
     * Clear all product and category cache
     * Use: Product schema changes, category restructure
     */
    async clearCatalog(): Promise<void> {
      console.log("🧹 Clearing catalog cache (products + categories)...");
      await CacheModule.product.clearAll();
      await CacheModule.category.clearAll();
    },
  },
};

/**
 * 🎯 Cache Warming Utilities (Optional - for performance optimization)
 * Pre-load frequently accessed data into cache
 */
export const CacheWarmer = {
  /**
   * Warm up category tree cache
   */
  async warmCategoryTree(): Promise<void> {
    console.log("🔥 Warming up category tree cache...");
    // This would be called from your category service
    // categoryService.getCategoryTree() would cache the result
  },

  /**
   * Warm up featured products
   */
  async warmFeaturedProducts(): Promise<void> {
    console.log("🔥 Warming up featured products cache...");
    // This would be called from your product service
  },

  /**
   * Warm up home page data
   */
  async warmHomePage(): Promise<void> {
    console.log("🔥 Warming up home page cache...");
    await this.warmCategoryTree();
    await this.warmFeaturedProducts();
  },
};