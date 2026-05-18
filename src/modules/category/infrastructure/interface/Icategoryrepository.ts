import { Category, Prisma } from "@/generated/prisma/client.js";

export interface ICategoryRepository {
  findById(id: bigint): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;

  findAll(params: {
    skip:     number;
    take:     number;
    where?:   Prisma.CategoryWhereInput;
    orderBy?: Prisma.CategoryOrderByWithRelationInput;
    include?: Prisma.CategoryInclude;
  }): Promise<Category[]>;

  findAllWithActiveProductCount(params: {
    skip:     number;
    take:     number;
    where?:   any;
    orderBy?: any;
  }): Promise<Category[]>;

  count(where?: any): Promise<number>;

  /**
   * NOTE: slug must be pre-computed (scoped) by the service layer before calling create().
   * The repository does NOT generate slugs — it stores exactly what it receives.
   */
  create(data: {
    name:                   string;
    slug:                   string;
    description?:           string;
    parentId?:              bigint;
    metaTitle?:             string;
    metaDesc?:              string;
    image?:                 string;
    isActive:               boolean;
    order:                  number;
    hasVideoConsultation?:  boolean;
    videoPurchasingEnabled?: boolean;
    videoConsultationNote?: string;
  }): Promise<Category>;

  update(id: bigint, data: Partial<Category>): Promise<Category>;
  delete(id: bigint): Promise<void>;

  findChildren(parentId: bigint): Promise<Category[]>;
  findWithChildren(id: bigint): Promise<Category | null>;

  // ── Descendant helpers ────────────────────────────────────────────────────

  /** Recursively collect IDs of this category + all active descendants. */
  getAllDescendantIds(categoryId: bigint): Promise<bigint[]>;

  /** Public-facing: active categories only. */
  getCategoryWithDescendants(slug: string): Promise<{
    category:       Category;
    descendantIds:  bigint[];
  } | null>;

  /** Admin-facing: includes inactive categories. */
  getCategoryWithDescendantsAdmin(slug: string): Promise<{
    category:       Category;
    descendantIds:  bigint[];
  } | null>;

  getMultipleCategoriesWithDescendants(slugs: string[]): Promise<{
    categories:      Category[];
    allDescendantIds: bigint[];
  }>;
}