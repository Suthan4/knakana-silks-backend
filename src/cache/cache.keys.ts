/**
 * 🔑 Centralized Cache Keys & Patterns
 * 
 * Standard naming convention:
 * {module}:{operation}:{identifier}
 * 
 * Examples:
 * - category:detail:123
 * - category:slug:sarees
 * - category:tree:root
 * - category:list:page:1:limit:10
 */

export const CacheKeys = {
  /**
   * 📁 CATEGORY MODULE (Decentralized)
   * Category cache keys are now located in their feature module:
   * @see "@/modules/category/category.cache.js"
   */

  /**
   * 📦 PRODUCT MODULE
   */
  product: {
    detail: (id: string | number | bigint) => `product:detail:${id.toString()}`,
    detailBySlug: (slug: string) => `product:slug:${slug}`,
    list: (params?: {
      page?: number;
      limit?: number;
      categorySlug?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => {
      if (!params) return `product:list:all`;
      const parts = ["product:list"];
      if (params.page) parts.push(`page:${params.page}`);
      if (params.limit) parts.push(`limit:${params.limit}`);
      if (params.categorySlug) parts.push(`cat:${params.categorySlug}`);
      if (params.search) parts.push(`search:${params.search}`);
      if (params.sortBy) parts.push(`sort:${params.sortBy}:${params.sortOrder || "asc"}`);
      return parts.join(":");
    },
    byCategory: (categorySlug: string) => `product:category:${categorySlug}`,
    stock: (productId: string | number | bigint, warehouseId: string | number | bigint, variantId?: string | number | bigint) => 
      variantId 
        ? `product:stock:${productId}:variant:${variantId}:warehouse:${warehouseId}`
        : `product:stock:${productId}:warehouse:${warehouseId}`,
    variants: (productId: string | number | bigint) => `product:variants:${productId}`,
    variantDetail: (variantId: string | number | bigint) => `product:variant:${variantId}`,
    specifications: (productId: string | number | bigint) => `product:specs:${productId}`,
    media: (productId: string | number | bigint) => `product:media:${productId}`,
    variantMedia: (variantId: string | number | bigint) => `product:variant:media:${variantId}`,
    featured: () => `product:featured`,
    newArrivals: (limit?: number) => `product:new:${limit || 10}`,
    bestSellers: (limit?: number) => `product:bestsellers:${limit || 10}`,
    related: (productId: string | number | bigint) => `product:related:${productId}`,
  },

  /**
   * 🏠 HOME/UI MODULE
   */
  home: {
    sections: () => `home:sections`,
    banners: () => `home:banners`,
    featuredCollections: () => `home:collections:featured`,
  },

  /**
   * 👤 USER MODULE
   */
  user: {
    detail: (id: string | number | bigint) => `user:detail:${id}`,
    detailByEmail: (email: string) => `user:email:${email}`,
    permissions: (id: string | number | bigint) => `user:permissions:${id}`,
    addresses: (id: string | number | bigint) => `user:addresses:${id}`,
    cart: (id: string | number | bigint) => `user:cart:${id}`,
    wishlist: (id: string | number | bigint) => `user:wishlist:${id}`,
  },

  /**
   * 📦 ORDER MODULE
   */
  order: {
    detail: (id: string | number | bigint) => `order:detail:${id}`,
    detailByNumber: (orderNumber: string) => `order:number:${orderNumber}`,
    userOrders: (userId: string | number | bigint) => `order:user:${userId}`,
  },

  /**
   * 🏢 WAREHOUSE MODULE
   */
  warehouse: {
    detail: (id: string | number | bigint) => `warehouse:detail:${id}`,
    list: () => `warehouse:list`,
    active: () => `warehouse:active`,
  },

  /**
   * 🎟️ COUPON MODULE
   */
  coupon: {
    detail: (id: string | number | bigint) => `coupon:detail:${id}`,
    detailByCode: (code: string) => `coupon:code:${code}`,
    active: () => `coupon:active`,
    userEligible: (userId: string | number | bigint) => `coupon:user:${userId}`,
  },

  /**
   * ⭐ REVIEW MODULE
   */
  review: {
    productReviews: (productId: string | number | bigint) => `review:product:${productId}`,
    userReviews: (userId: string | number | bigint) => `review:user:${userId}`,
  },
};

/**
 * 🎯 Cache Key Patterns for Bulk Invalidation
 * Use with cacheService.invalidatePattern()
 */
export const CachePatterns = {
  product: {
    all: "product:*",
    lists: "product:list:*",
    byCategory: (categorySlug: string) => `product:*cat:${categorySlug}*`,
    details: "product:detail:*",
    slugs: "product:slug:*",
    stock: "product:stock:*",
    variants: "product:variant*",
  },
  
  user: {
    all: "user:*",
    carts: "user:cart:*",
    wishlists: "user:wishlist:*",
  },
  
  order: {
    all: "order:*",
  },
  
  home: {
    all: "home:*",
  },
};

/**
 * 🕐 Cache TTL Configuration (in seconds)
 * Production rule: 10 minutes (600 seconds) for Category module
 */
export const CacheTTL = {
  product: {
    detail: 3600,        // 1 hour
    list: 1800,          // 30 minutes
    stock: 300,          // 5 minutes
    featured: 7200,      // 2 hours
  },
  
  user: {
    detail: 3600,        // 1 hour
    cart: 600,           // 10 minutes
    wishlist: 1800,      // 30 minutes
  },
  
  home: {
    sections: 7200,      // 2 hours
    banners: 7200,       // 2 hours
  },
  
  short: 300,            // 5 minutes
  medium: 600,           // 10 minutes
  long: 3600,            // 1 hour
  veryLong: 86400,       // 24 hours
};