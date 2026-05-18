import { injectable, inject } from "tsyringe";
import { SlugUtil } from "@/shared/utils/index.js";
import { ICategoryRepository } from "../../infrastructure/interface/Icategoryrepository.js";

@injectable()
export class CategoryService {
  constructor(
    @inject("ICategoryRepository")
    private categoryRepository: ICategoryRepository
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Builds a slug that is scoped to the parent.
   * Root category  →  "sarees"
   * Child category →  "whats-new-sarees"
   *
   * This guarantees a category named "Sarees" under "What's New" never collides
   * with a root "Sarees" category, because they produce different slugs.
   */
  private async buildScopedSlug(name: string, parentId?: string | null): Promise<string> {
    const base = SlugUtil.generateSlug(name);

    if (!parentId) return base;

    const parent = await this.categoryRepository.findById(BigInt(parentId));
    if (!parent) throw new Error("Parent category not found");

    return `${parent.slug}-${base}`;
  }

  /**
   * Checks that a slug is not already used by another category.
   * Pass `excludeId` when updating so we don't flag the category against itself.
   */
  private async assertSlugUnique(slug: string, excludeId?: bigint): Promise<void> {
    const existing = await this.categoryRepository.findBySlug(slug);
    if (existing && existing.id !== excludeId) {
      throw new Error("Category with this name already exists under the same parent");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  async createCategory(data: {
    name: string;
    description?: string;
    parentId?: string;
    metaTitle?: string;
    metaDesc?: string;
    image?: string;
    isActive?: boolean;
    order?: number;
    hasVideoConsultation?: boolean;
    videoPurchasingEnabled?: boolean;
    videoConsultationNote?: string;
  }) {
    // 1. If a parentId was provided, validate the parent exists first
    if (data.parentId) {
      const parent = await this.categoryRepository.findById(BigInt(data.parentId));
      if (!parent) throw new Error("Parent category not found");
    }

    // 2. Build a parent-scoped slug  (e.g. "whats-new-sarees" instead of "sarees")
    const slug = await this.buildScopedSlug(data.name, data.parentId);

    // 3. Ensure the resulting slug is unique (no other category has it)
    await this.assertSlugUnique(slug);

    // 4. Persist
    const category = await this.categoryRepository.create({
      name: data.name,
      slug,
      description: data.description,
      parentId: data.parentId ? BigInt(data.parentId) : undefined,
      metaTitle: data.metaTitle,
      metaDesc: data.metaDesc,
      image: data.image,
      isActive: data.isActive ?? true,
      order: data.order ?? 0,
      hasVideoConsultation: data.hasVideoConsultation ?? false,
      videoPurchasingEnabled: data.videoPurchasingEnabled ?? false,
      videoConsultationNote: data.videoConsultationNote,
    });

    return category;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  async updateCategory(
    id: string,
    data: {
      name?: string;
      description?: string;
      parentId?: string | null;
      metaTitle?: string;
      metaDesc?: string;
      image?: string;
      isActive?: boolean;
      order?: number;
      hasVideoConsultation?: boolean;
      videoPurchasingEnabled?: boolean;
      videoConsultationNote?: string;
    }
  ) {
    const categoryId = BigInt(id);

    // 1. Fetch current state
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) throw new Error("Category not found");

    // Guard: cannot be its own parent
    if (data.parentId && data.parentId === id) {
      throw new Error("Category cannot be its own parent");
    }

    // 2. Determine whether name or parent is changing
    const nameChanging = data.name !== undefined && data.name !== category.name;
    const parentChanging = data.parentId !== undefined;

    let slug = category.slug; // default: keep existing slug

    if (nameChanging || parentChanging) {
      // Resolve the effective name and parentId after the update
      const effectiveName     = data.name     ?? category.name;
      const effectiveParentId =
        parentChanging
          ? (data.parentId ?? null)                        // explicitly set (incl. null = move to root)
          : (category.parentId?.toString() ?? null);       // unchanged

      // Validate the new parent exists (if any)
      if (effectiveParentId) {
        const parent = await this.categoryRepository.findById(BigInt(effectiveParentId));
        if (!parent) throw new Error("Parent category not found");
      }

      // Build the new scoped slug
      slug = await this.buildScopedSlug(effectiveName, effectiveParentId ?? undefined);

      // Ensure uniqueness, excluding the current category
      await this.assertSlugUnique(slug, categoryId);
    }

    // 3. Persist
    const updated = await this.categoryRepository.update(categoryId, {
      ...data,
      slug,
      parentId:
        data.parentId === null
          ? null
          : data.parentId
          ? BigInt(data.parentId)
          : undefined,
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────────────────────

  async deleteCategory(id: string) {
    const categoryId = BigInt(id);

    const children = await this.categoryRepository.findChildren(categoryId);
    if (children.length > 0) {
      throw new Error("Cannot delete category with subcategories");
    }

    await this.categoryRepository.delete(categoryId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────────

  async getCategory(id: string) {
    const category = await this.categoryRepository.findById(BigInt(id));
    if (!category) throw new Error("Category not found");
    return category;
  }

  async getCategoryBySlug(slug: string) {
    const category = await this.categoryRepository.findBySlug(slug);
    if (!category) throw new Error("Category not found");
    return category;
  }

  /**
   * Get category + all descendant IDs (used by ProductController for nested product queries).
   */
  async getCategoryWithDescendants(slug: string) {
    const result = await this.categoryRepository.getCategoryWithDescendants(slug);
    if (!result) throw new Error("Category not found");
    return result;
  }

  async getCategoryWithDescendantsAdmin(slug: string) {
    const result = await this.categoryRepository.getCategoryWithDescendantsAdmin(slug);
    if (!result) throw new Error("Category not found");
    return result;
  }

  async getCategories(params: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
    parentId?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};

    if (params.search) {
      where.OR = [
        { name:        { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.parentId !== undefined) {
      where.parentId = params.parentId ? BigInt(params.parentId) : null;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "order"] = params.sortOrder || "asc";

    const [categories, total] = await Promise.all([
      this.categoryRepository.findAll({ skip, take: params.limit, where, orderBy }),
      this.categoryRepository.count(where),
    ]);

    return {
      categories,
      pagination: {
        page:       params.page,
        limit:      params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getCategoryTree(id?: string) {
    if (id) {
      return this.categoryRepository.findWithChildren(BigInt(id));
    }

    return this.categoryRepository.findAllWithActiveProductCount({
      skip:     0,
      take:     100,
      where:    { parentId: null, isActive: true },
      orderBy:  { order: "asc" },
    });
  }
}