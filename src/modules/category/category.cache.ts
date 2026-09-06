import { cacheService } from "@/cache/cache.service.js";

/**
 * 📁 Category Module Cache Configuration
 * 
 * Decentralized cache keys, invalidation patterns, and TTLs for the Category bounded context.
 * Standard naming convention: category:{operation}:{identifier}
 * Decentralized cache keys, invalidation patterns, TTLs, and cache management
 * for the Category bounded context. Standard naming convention: category:{operation}:{identifier}
 */

export interface CategoryListCacheParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  isRoot?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * 🔑 Category Cache Keys
 */
export const CategoryCacheKeys = {
  // Single category detail by ID
  detail: (id: string | number | bigint): string => `category:detail:${id.toString()}`,

  // Category detail by slug
  detailBySlug: (slug: string): string => `category:slug:${slug}`,

  // Category with active descendants (public catalog)
  withDescendants: (slug: string): string => `category:descendants:${slug}`,

  // Category with all descendants (admin views)
  withDescendantsAdmin: (slug: string): string => `category:descendants:admin:${slug}`,

  // Category hierarchy tree (root or scoped to parent category ID)
  tree: (id?: string | number | bigint): string =>
    id ? `category:tree:${id.toString()}` : `category:tree:root`,

  // Category list with normalized filtering & pagination query parameters
  list: (params?: CategoryListCacheParams): string => {
    if (!params) return `category:list:all`;

    const parts = ["category:list"];
    if (params.page !== undefined) parts.push(`p:${params.page}`);
    if (params.limit !== undefined) parts.push(`l:${params.limit}`);
    if (params.search && params.search.trim()) {
      parts.push(`s:${params.search.toLowerCase().trim()}`);
    }
    if (params.isActive !== undefined) parts.push(`act:${params.isActive}`);
    if (params.isRoot !== undefined) parts.push(`root:${params.isRoot}`);
    if (params.sortBy) parts.push(`sort:${params.sortBy}:${params.sortOrder || "asc"}`);

    return parts.join(":");
  },
};

/**
 * 🎯 Category Cache Invalidation Patterns (SCAN + Redis Pipelining)
 */
export const CategoryCachePatterns = {
  all: "category:*",
  lists: "category:list:*",
  trees: "category:tree*",
  details: "category:detail:*",
  slugs: "category:slug:*",
  descendants: "category:descendants:*",
};

/**
 * 🕐 Category Cache TTL Configuration (in seconds)
 * Production rule: 10 minutes (600 seconds) for category caching
 */
export const CategoryCacheTTL = {
  default: 600,     // 10 minutes
  detail: 600,      // 10 minutes
  tree: 600,        // 10 minutes
  list: 600,        // 10 minutes
  descendants: 600, // 10 minutes
};

/**
 * 📢 Cross-Domain Invalidation Events & Subscriber Types
 * Enables loosely coupled cross-domain cache invalidation without hard dependencies
 */
export type CategoryCacheInvalidationEvent = {
  type: "create" | "update" | "delete" | "hierarchy_change";
  id?: string | number | bigint;
  slug?: string;
};

export type CategoryCacheInvalidationListener = (
  event: CategoryCacheInvalidationEvent
) => Promise<void> | void;

/**
 * 🧩 Decentralized Category Cache Operations
 * Self-contained category cache invalidation logic with decoupled event listener support
 */
export const CategoryCacheModule = {
  listeners: [] as CategoryCacheInvalidationListener[],

  /**
   * Subscribe an external domain/service to category cache invalidation events
   * (e.g., Product module listening to clear its category-derived caches)
   */
  onInvalidate(listener: CategoryCacheInvalidationListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  },

  /**
   * Notify external subscribers of a category cache invalidation event
   */
  async notifyListeners(event: CategoryCacheInvalidationEvent): Promise<void> {
    await Promise.allSettled(this.listeners.map((listener) => listener(event)));
  },

  /**
   * Clear all category-related cache
   */
  async clearAll(): Promise<void> {
    console.log("🧹 Clearing ALL category cache...");
    await cacheService.invalidatePattern(CategoryCachePatterns.all);
  },

  /**
   * Clear single category cache
   */
  async clearCategory(id: string | number | bigint, slug?: string): Promise<void> {
    console.log(`🧹 Clearing category cache for ID: ${id}`);
    const keys = [CategoryCacheKeys.detail(id)];

    if (slug) {
      keys.push(
        CategoryCacheKeys.detailBySlug(slug),
        CategoryCacheKeys.withDescendants(slug),
        CategoryCacheKeys.withDescendantsAdmin(slug)
      );
    }

    await cacheService.delMultiple(keys);
  },

  /**
   * Clear category tree cache
   */
  async clearTree(): Promise<void> {
    console.log("🧹 Clearing category tree cache...");
    await cacheService.invalidatePattern(CategoryCachePatterns.trees);
    await cacheService.del(CategoryCacheKeys.tree());
  },

  /**
   * Clear category lists
   */
  async clearLists(): Promise<void> {
    console.log("🧹 Clearing category lists...");
    await cacheService.invalidatePattern(CategoryCachePatterns.lists);
  },

  /**
   * Complete category update cache strategy
   */
  async onCategoryUpdate(id: string | number | bigint, slug?: string): Promise<void> {
    console.log(`🧹 Category update cache clear for ID: ${id}`);
    await this.clearCategory(id, slug);
    await this.clearTree();
    await this.clearLists();
    await cacheService.invalidatePattern(CategoryCachePatterns.descendants);
    await this.notifyListeners({ type: "update", id, slug });
  },

  /**
   * Category creation cache strategy
   */
  async onCategoryCreate(): Promise<void> {
    console.log(`🧹 Category creation cache clear`);
    await this.clearTree();
    await this.clearLists();
    await this.notifyListeners({ type: "create" });
  },

  /**
   * Category deletion cache strategy
   */
  async onCategoryDelete(id: string | number | bigint, slug?: string): Promise<void> {
    console.log(`🧹 Category deletion cache clear for ID: ${id}`);
    await this.clearCategory(id, slug);
    await this.clearTree();
    await this.clearLists();
    await cacheService.invalidatePattern(CategoryCachePatterns.descendants);
    await this.notifyListeners({ type: "delete", id, slug });
  },

  /**
   * Category hierarchy / placement change strategy
   */
  async onHierarchyChange(): Promise<void> {
    console.log(`🧹 Category hierarchy change - clearing all category cache`);
    await this.clearAll();
    await this.notifyListeners({ type: "hierarchy_change" });
  },
};

/**
 * 📦 Grouped Category Cache Namespace
 */
export const categoryCache = {
  keys: CategoryCacheKeys,
  patterns: CategoryCachePatterns,
  ttl: CategoryCacheTTL,
  module: CategoryCacheModule,
};
