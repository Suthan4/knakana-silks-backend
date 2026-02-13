/**
 * 🔑 Centralized Cache Keys
 * 
 * Standard naming convention:
 * {module}:{operation}:{identifier}
 * 
 * Examples:
 * - product:detail:123
 * - category:tree
 * - product:list:page:1:limit:12
 */

export const CacheKeys = {
  /**
   * 📦 PRODUCT MODULE
   */
  product: {
    // Single product detail
    detail: (id: string | number) => `product:detail:${id}`,
    
    // Single product by slug
    detailBySlug: (slug: string) => `product:slug:${slug}`,
    
    // Product list with pagination
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
    
    // Products by category (including descendants)
    byCategory: (categorySlug: string) => `product:category:${categorySlug}`,
    
    // Product stock
    stock: (productId: string | number, warehouseId: string | number, variantId?: string | number) => 
      variantId 
        ? `product:stock:${productId}:variant:${variantId}:warehouse:${warehouseId}`
        : `product:stock:${productId}:warehouse:${warehouseId}`,
    
    // Product variants
    variants: (productId: string | number) => `product:variants:${productId}`,
    
    // Single variant detail
    variantDetail: (variantId: string | number) => `product:variant:${variantId}`,
    
    // Product specifications
    specifications: (productId: string | number) => `product:specs:${productId}`,
    
    // Product media
    media: (productId: string | number) => `product:media:${productId}`,
    
    // Variant media
    variantMedia: (variantId: string | number) => `product:variant:media:${variantId}`,
    
    // Featured products
    featured: () => `product:featured`,
    
    // New arrivals
    newArrivals: (limit?: number) => `product:new:${limit || 10}`,
    
    // Best sellers
    bestSellers: (limit?: number) => `product:bestsellers:${limit || 10}`,
    
    // Related products
    related: (productId: string | number) => `product:related:${productId}`,
  },

  /**
   * 📁 CATEGORY MODULE
   */
  category: {
    // Single category detail
    detail: (id: string | number) => `category:detail:${id}`,
    
    // Category by slug
    detailBySlug: (slug: string) => `category:slug:${slug}`,
    
    // Category with descendants
    withDescendants: (slug: string) => `category:descendants:${slug}`,
    
    // Full category tree
    tree: () => `category:tree`,
    
    // Root categories only
    rootCategories: () => `category:root`,
    
    // Category children
    children: (id: string | number) => `category:children:${id}`,
    
    // All categories list
    list: (params?: {
      page?: number;
      limit?: number;
      parentId?: string;
      isActive?: boolean;
    }) => {
      if (!params) return `category:list:all`;
      
      const parts = ["category:list"];
      if (params.page) parts.push(`page:${params.page}`);
      if (params.limit) parts.push(`limit:${params.limit}`);
      if (params.parentId) parts.push(`parent:${params.parentId}`);
      if (params.isActive !== undefined) parts.push(`active:${params.isActive}`);
      
      return parts.join(":");
    },
    
    // Category product count
    productCount: (id: string | number) => `category:products:count:${id}`,
  },

  /**
   * 🏠 HOME/UI MODULE
   */
  home: {
    // Home sections
    sections: () => `home:sections`,
    
    // Banners
    banners: () => `home:banners`,
    
    // Featured collections
    featuredCollections: () => `home:collections:featured`,
  },

  /**
   * 👤 USER MODULE
   */
  user: {
    // User detail
    detail: (id: string | number) => `user:detail:${id}`,
    
    // User by email
    detailByEmail: (email: string) => `user:email:${email}`,
    
    // User permissions
    permissions: (id: string | number) => `user:permissions:${id}`,
    
    // User addresses
    addresses: (id: string | number) => `user:addresses:${id}`,
    
    // User cart
    cart: (id: string | number) => `user:cart:${id}`,
    
    // User wishlist
    wishlist: (id: string | number) => `user:wishlist:${id}`,
  },

  /**
   * 📦 ORDER MODULE
   */
  order: {
    // Order detail
    detail: (id: string | number) => `order:detail:${id}`,
    
    // Order by number
    detailByNumber: (orderNumber: string) => `order:number:${orderNumber}`,
    
    // User orders
    userOrders: (userId: string | number) => `order:user:${userId}`,
  },

  /**
   * 🏢 WAREHOUSE MODULE
   */
  warehouse: {
    // Warehouse detail
    detail: (id: string | number) => `warehouse:detail:${id}`,
    
    // All warehouses
    list: () => `warehouse:list`,
    
    // Active warehouses only
    active: () => `warehouse:active`,
  },

  /**
   * 🎟️ COUPON MODULE
   */
  coupon: {
    // Coupon detail
    detail: (id: string | number) => `coupon:detail:${id}`,
    
    // Coupon by code
    detailByCode: (code: string) => `coupon:code:${code}`,
    
    // Active coupons
    active: () => `coupon:active`,
    
    // User eligible coupons
    userEligible: (userId: string | number) => `coupon:user:${userId}`,
  },

  /**
   * ⭐ REVIEW MODULE
   */
  review: {
    // Product reviews
    productReviews: (productId: string | number) => `review:product:${productId}`,
    
    // User reviews
    userReviews: (userId: string | number) => `review:user:${userId}`,
  },
};

/**
 * 🎯 Cache Key Patterns for Bulk Operations
 * Use with cacheService.delByPattern()
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
  
  category: {
    all: "category:*",
    lists: "category:list:*",
    trees: "category:tree*",
    details: "category:detail:*",
    slugs: "category:slug:*",
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
 */
export const CacheTTL = {
  product: {
    detail: 3600,        // 1 hour
    list: 1800,          // 30 minutes
    stock: 300,          // 5 minutes (frequently updated)
    featured: 7200,      // 2 hours
  },
  
  category: {
    detail: 7200,        // 2 hours (rarely changes)
    tree: 7200,          // 2 hours
    list: 3600,          // 1 hour
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
  medium: 1800,          // 30 minutes
  long: 7200,            // 2 hours
  veryLong: 86400,       // 24 hours
};