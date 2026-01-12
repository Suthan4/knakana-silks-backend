import { Category } from "@/generated/prisma/client.js";

export interface ICategoryRepository {
  findById(id: bigint): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Category[]>;
  count(where?: any): Promise<number>;
  create(data: {
    name: string;
    slug: string;
    description?: string;
    parentId?: bigint;
    metaTitle?: string;
    metaDesc?: string;
    image?: string;
    isActive: boolean;
    order: number;
  }): Promise<Category>;
  update(id: bigint, data: Partial<Category>): Promise<Category>;
  delete(id: bigint): Promise<void>;
  findChildren(parentId: bigint): Promise<Category[]>;
  findWithChildren(id: bigint): Promise<Category | null>;

  // ✅ NEW: Descendant support methods
  getAllDescendantIds(categoryId: bigint): Promise<bigint[]>;
  getCategoryWithDescendants(slug: string): Promise<{
    category: Category;
    descendantIds: bigint[];
  } | null>;
  getMultipleCategoriesWithDescendants(slugs: string[]): Promise<{
    categories: Category[];
    allDescendantIds: bigint[];
  }>;
}
