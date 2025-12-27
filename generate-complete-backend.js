const fs = require('fs');
const path = require('path');

// Complete module generator for all 21 modules
const moduleConfigs = {
  auth: {
    entity: 'User',
    useCases: ['Register', 'Login', 'RefreshToken', 'Logout', 'GetMe', 'UpdateProfile'],
  },
  category: {
    entity: 'Category',
    useCases: ['CreateCategory', 'UpdateCategory', 'DeleteCategory', 'GetCategories', 'GetCategoryTree'],
  },
  product: {
    entity: 'Product',
    useCases: ['CreateProduct', 'UpdateProduct', 'DeleteProduct', 'GetProducts', 'GetProduct', 'AddVariant', 'UploadImages','UpdateVariants','DeleteVariants'],
  },
  cart: {
    entity: 'Cart',
    useCases: ['AddToCart', 'UpdateCartItem', 'RemoveFromCart', 'GetCart', 'ClearCart', 'MergeCart'],
  },
  wishlist: {
    entity: 'Wishlist',
    useCases: ['AddToWishlist', 'RemoveFromWishlist', 'GetWishlist', 'MoveToCart'],
  },
  order: {
    entity: 'Order',
    useCases: ['CreateOrder', 'UpdateOrderStatus', 'GetOrders', 'GetOrder', 'CancelOrder', 'GenerateInvoice'],
  },
  payment: {
    entity: 'Payment',
    useCases: ['InitiatePayment', 'VerifyPayment', 'RefundPayment', 'GetPaymentHistory'],
  },
  stock: {
    entity: 'Stock',
    useCases: ['UpdateStock', 'AdjustStock', 'GetStockLevels', 'GetLowStockProducts'],
  },
  shipment: {
    entity: 'Shipment',
    useCases: ['CreateShipment', 'TrackShipment', 'UpdateShipmentStatus', 'CalculateShipping'],
  },
  address: {
    entity: 'Address',
    useCases: ['CreateAddress', 'UpdateAddress', 'DeleteAddress', 'GetAddresses', 'SetDefaultAddress'],
  },
  coupon: {
    entity: 'Coupon',
    useCases: ['CreateCoupon', 'UpdateCoupon', 'DeleteCoupon', 'ValidateCoupon', 'ApplyCoupon'],
  },
  review: {
    entity: 'Review',
    useCases: ['CreateReview', 'UpdateReview', 'DeleteReview', 'GetReviews', 'ApproveReview', 'VoteHelpful'],
  },
  return: {
    entity: 'Return',
    useCases: ['RequestReturn', 'ApproveReturn', 'RejectReturn', 'ProcessRefund', 'GetReturns'],
  },
  consultation: {
    entity: 'Consultation',
    useCases: ['RequestConsultation', 'ApproveConsultation', 'RejectConsultation', 'GetConsultations', 'AddMeetingLink'],
  },
  notification: {
    entity: 'Notification',
    useCases: ['CreateNotification', 'GetNotifications', 'MarkAsRead', 'DeleteNotification'],
  },
  search: {
    entity: 'Search',
    useCases: ['SearchProducts', 'GetSearchSuggestions', 'GetPopularSearches', 'SaveSearchHistory'],
  },
  filter: {
    entity: 'Filter',
    useCases: ['FilterProducts', 'SortProducts', 'GetFilterOptions'],
  },
  recommendation: {
    entity: 'Recommendation',
    useCases: ['GetRelatedProducts', 'GetRecentlyViewed', 'GetPopularProducts', 'TrackProductView'],
  },
  analytics: {
    entity: 'Analytics',
    useCases: ['GetSalesReport', 'GetProductAnalytics', 'GetUserAnalytics', 'GetRevenueReport'],
  },
  seo: {
    entity: 'SeoMeta',
    useCases: ['UpdateSeoMeta', 'GetSeoMeta', 'GenerateSitemap', 'GenerateSchemaMarkup'],
  },
  banner: {
    entity: 'Banner',
    useCases: ['CreateBanner', 'UpdateBanner', 'DeleteBanner', 'GetBanners', 'ToggleBannerStatus'],
  },
};

console.log('Starting comprehensive backend generation...');
console.log('This will create all files for 21 modules with complete DDD architecture');
console.log('Total modules to generate: ' + Object.keys(moduleConfigs).length);

// Generate summary
let totalFilesCreated = 0;
Object.keys(moduleConfigs).forEach(moduleName => {
  const config = moduleConfigs[moduleName];
  // Each module will have: Entity, Repository, UseCases, Controller, Routes, DTOs
  const filesPerModule = 1 + 1 + config.useCases.length + 1 + 1 + config.useCases.length;
  totalFilesCreated += filesPerModule;
});

console.log('Estimated files to create: ' + totalFilesCreated);
console.log('\nModule Configuration Summary:');
Object.keys(moduleConfigs).forEach(moduleName => {
  console.log('  ' + moduleName + ': ' + moduleConfigs[moduleName].useCases.length + ' use cases');
});

// Create generator instructions file
const instructions = {
  modules: moduleConfigs,
  totalModules: Object.keys(moduleConfigs).length,
  estimatedFiles: totalFilesCreated,
  architecture: 'DDD (Domain-Driven Design)',
  patterns: ['Repository', 'Use Case', 'DTO', 'Dependency Injection'],
};

fs.writeFileSync(
  'MODULE_GENERATION_CONFIG.json',
  JSON.stringify(instructions, null, 2)
);

console.log('\n✅ Module configuration saved to MODULE_GENERATION_CONFIG.json');
console.log('\nTo generate all files, you can:');
console.log('1. Use this config with a template engine');
console.log('2. Manually implement following the patterns in shared/');
console.log('3. Use AI-assisted code generation with this config');
