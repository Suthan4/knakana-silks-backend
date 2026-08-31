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
     */
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL product cache...");
      await cacheService.invalidatePattern(CachePatterns.product.all);
    },

    /**
     * Clear single product cache (detail + slug)
     */
    async clearProduct(id: string | number | bigint, slug?: string): Promise<void> {
      console.log(`🧹 Clearing product cache for ID: ${id}`);
      const keys = [CacheKeys.product.detail(id)];
      
      if (slug) {
        keys.push(CacheKeys.product.detailBySlug(slug));
      }
      
      await cacheService.delMultiple(keys);
    },

    /**
     * Clear product lists
     */
    async clearLists(): Promise<void> {
      console.log("🧹 Clearing all product lists...");
      await cacheService.invalidatePattern(CachePatterns.product.lists);
    },

    /**
     * Clear category-specific product caches
     */
    async clearByCategory(categorySlug: string): Promise<void> {
      console.log(`🧹 Clearing product cache for category: ${categorySlug}`);
      await cacheService.invalidatePattern(CachePatterns.product.byCategory(categorySlug));
      await this.clearLists();
    },

    /**
     * Clear product stock cache
     */
    async clearStock(productId: string | number | bigint): Promise<void> {
      console.log(`🧹 Clearing stock cache for product: ${productId}`);
      await cacheService.invalidatePattern(`product:stock:${productId}*`);
    },

    /**
     * Clear variant cache
     */
    async clearVariants(productId: string | number | bigint): Promise<void> {
      console.log(`🧹 Clearing variants cache for product: ${productId}`);
      const keys = [
        CacheKeys.product.variants(productId),
      ];
      await cacheService.delMultiple(keys);
      await cacheService.invalidatePattern(`product:variant:${productId}*`);
    },

    /**
     * Clear featured/special lists
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
     */
    async onProductUpdate(id: string | number | bigint, slug: string, categorySlug?: string): Promise<void> {
      console.log(`🧹 Product update cache clear for: ${id}`);
      await this.clearProduct(id, slug);
      await this.clearLists();
      if (categorySlug) {
        await this.clearByCategory(categorySlug);
      }
      await this.clearSpecialLists();
    },

    /**
     * Product creation cache strategy
     */
    async onProductCreate(categorySlug?: string): Promise<void> {
      console.log(`🧹 Product creation cache clear`);
      await this.clearLists();
      if (categorySlug) {
        await this.clearByCategory(categorySlug);
      }
      await this.clearSpecialLists();
    },

    /**
     * Product deletion cache strategy
     */
    async onProductDelete(id: string | number | bigint, slug: string, categorySlug?: string): Promise<void> {
      console.log(`🧹 Product deletion cache clear for: ${id}`);
      await this.clearProduct(id, slug);
      await this.clearVariants(id);
      await this.clearStock(id);
      await cacheService.invalidatePattern(`product:*:${id}*`);
      await this.clearLists();
      if (categorySlug) {
        await this.clearByCategory(categorySlug);
      }
      await this.clearSpecialLists();
    },
  },

  /**
   * 📁 CATEGORY MODULE CACHE OPERATIONS
   */
  category: {
    /**
     * Clear all category-related cache
     */
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL category cache...");
      await cacheService.invalidatePattern(CachePatterns.category.all);
    },

    /**
     * Clear single category cache
     */
    async clearCategory(id: string | number | bigint, slug?: string): Promise<void> {
      console.log(`🧹 Clearing category cache for ID: ${id}`);
      const keys = [CacheKeys.category.detail(id)];
      
      if (slug) {
        keys.push(
          CacheKeys.category.detailBySlug(slug),
          CacheKeys.category.withDescendants(slug),
          CacheKeys.category.withDescendantsAdmin(slug)
        );
      }
      
      await cacheService.delMultiple(keys);
    },

    /**
     * Clear category tree cache
     */
    async clearTree(): Promise<void> {
      console.log("🧹 Clearing category tree cache...");
      await cacheService.invalidatePattern(CachePatterns.category.trees);
      await cacheService.del(CacheKeys.category.rootCategories());
    },

    /**
     * Clear category lists
     */
    async clearLists(): Promise<void> {
      console.log("🧹 Clearing category lists...");
      await cacheService.invalidatePattern(CachePatterns.category.lists);
    },

    /**
     * Complete category update cache strategy
     */
    async onCategoryUpdate(id: string | number | bigint, slug?: string): Promise<void> {
      console.log(`🧹 Category update cache clear for ID: ${id}`);
      await this.clearCategory(id, slug);
      await this.clearTree();
      await this.clearLists();
      await cacheService.invalidatePattern(CachePatterns.category.descendants);
      if (slug) {
        await CacheModule.product.clearByCategory(slug);
      }
    },

    /**
     * Category creation cache strategy
     */
    async onCategoryCreate(): Promise<void> {
      console.log(`🧹 Category creation cache clear`);
      await this.clearTree();
      await this.clearLists();
      await CacheModule.product.clearLists();
    },

    /**
     * Category deletion cache strategy
     */
    async onCategoryDelete(id: string | number | bigint, slug?: string): Promise<void> {
      console.log(`🧹 Category deletion cache clear for ID: ${id}`);
      await this.clearCategory(id, slug);
      await this.clearTree();
      await this.clearLists();
      await cacheService.invalidatePattern(CachePatterns.category.descendants);
      if (slug) {
        await CacheModule.product.clearByCategory(slug);
      }
    },

    /**
     * Category hierarchy / placement change strategy
     */
    async onHierarchyChange(): Promise<void> {
      console.log(`🧹 Category hierarchy change - clearing all category cache`);
      await this.clearAll();
      await CacheModule.product.clearLists();
    },
  },

  /**
   * 🏠 HOME MODULE CACHE OPERATIONS
   */
  home: {
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL home cache...");
      await cacheService.invalidatePattern(CachePatterns.home.all);
    },

    async clearSections(): Promise<void> {
      console.log("🧹 Clearing home sections cache...");
      await cacheService.del(CacheKeys.home.sections());
    },

    async clearBanners(): Promise<void> {
      console.log("🧹 Clearing home banners cache...");
      await cacheService.del(CacheKeys.home.banners());
    },
  },

  /**
   * 👤 USER MODULE CACHE OPERATIONS
   */
  user: {
    async clearAll(): Promise<void> {
      console.log("🧹 Clearing ALL user cache...");
      await cacheService.invalidatePattern(CachePatterns.user.all);
    },

    async clearUser(id: string | number | bigint): Promise<void> {
      console.log(`🧹 Clearing user cache for ID: ${id}`);
      await cacheService.invalidatePattern(`user:*:${id}*`);
    },

    async clearCart(userId: string | number | bigint): Promise<void> {
      console.log(`🧹 Clearing cart cache for user: ${userId}`);
      await cacheService.del(CacheKeys.user.cart(userId));
    },

    async clearWishlist(userId: string | number | bigint): Promise<void> {
      console.log(`🧹 Clearing wishlist cache for user: ${userId}`);
      await cacheService.del(CacheKeys.user.wishlist(userId));
    },
  },

  /**
   * 🧹 GLOBAL CACHE OPERATIONS
   */
  global: {
    async clearAll(): Promise<void> {
      console.warn("⚠️  NUCLEAR OPTION: Clearing ALL cache...");
      await cacheService.flushAll();
    },

    async clearCatalog(): Promise<void> {
      console.log("🧹 Clearing catalog cache (products + categories)...");
      await CacheModule.product.clearAll();
      await CacheModule.category.clearAll();
    },
  },
};

/**
 * 🎯 Cache Warmer
 */
export const CacheWarmer = {
  async warmCategoryTree(): Promise<void> {
    console.log("🔥 Warming up category tree cache...");
  },

  async warmFeaturedProducts(): Promise<void> {
    console.log("🔥 Warming up featured products cache...");
  },

  async warmHomePage(): Promise<void> {
    console.log("🔥 Warming up home page cache...");
    await this.warmCategoryTree();
    await this.warmFeaturedProducts();
  },
};