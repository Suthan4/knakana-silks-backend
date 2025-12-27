export const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

export const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

export const generateSKU = (productName: string, variant?: string): string => {
  const slugged = slugify(productName).substring(0, 10).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  const variantPart = variant ? `-${slugify(variant).substring(0, 5).toUpperCase()}` : '';
  return `${slugged}-${randomPart}${variantPart}`;
};
