import { injectable, inject } from "tsyringe";
import { SlugUtil } from "@/shared/utils/index.js";
import { ICategoryRepository } from "../../infrastructure/interface/Icategoryrepository.js";

@injectable()
export class CategoryService {
  constructor(
    @inject("ICategoryRepository")
    private categoryRepository: ICategoryRepository
  ) {}

  async createCategory(data: {
    name: string;
    description?: string;
    parentId?: string;
    metaTitle?: string;
    metaDesc?: string;
    image?: string;
    isActive?: boolean;
    order?: number;
  }) {
    // Generate slug
    const slug = SlugUtil.generateSlug(data.name);

    // Check if slug exists
    const existing = await this.categoryRepository.findBySlug(slug);
    if (existing) {
      throw new Error("Category with this name already exists");
    }

    // Validate parent if provided
    if (data.parentId) {
      const parent = await this.categoryRepository.findById(
        BigInt(data.parentId)
      );
      if (!parent) {
        throw new Error("Parent category not found");
      }
    }

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
    });

    return category;
  }

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
    }
  ) {
    const categoryId = BigInt(id);

    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new Error("Category not found");
    }

    // Generate new slug if name changed
    let slug = category.slug;
    if (data.name && data.name !== category.name) {
      slug = SlugUtil.generateSlug(data.name);
      const existing = await this.categoryRepository.findBySlug(slug);
      if (existing && existing.id !== categoryId) {
        throw new Error("Category with this name already exists");
      }
    }

    // Validate parent
    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        // Allow setting to null
      } else if (data.parentId === id) {
        throw new Error("Category cannot be its own parent");
      } else {
        const parent = await this.categoryRepository.findById(
          BigInt(data.parentId)
        );
        if (!parent) {
          throw new Error("Parent category not found");
        }
      }
    }

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

  async deleteCategory(id: string) {
    const categoryId = BigInt(id);

    // Check if category has children
    const children = await this.categoryRepository.findChildren(categoryId);
    if (children.length > 0) {
      throw new Error("Cannot delete category with subcategories");
    }

    // Check if category has products (this will be enforced by Prisma cascade)
    await this.categoryRepository.delete(categoryId);
  }

  async getCategory(id: string) {
    const category = await this.categoryRepository.findById(BigInt(id));
    if (!category) {
      throw new Error("Category not found");
    }
    return category;
  }

  async getCategoryBySlug(slug: string) {
    const category = await this.categoryRepository.findBySlug(slug);
    if (!category) {
      throw new Error("Category not found");
    }
    return category;
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
        { name: { contains: params.search, mode: "insensitive" } },
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
      this.categoryRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.categoryRepository.count(where),
    ]);

    return {
      categories,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getCategoryTree(id?: string) {
    if (id) {
      return this.categoryRepository.findWithChildren(BigInt(id));
    }

    // Get root categories with their children
    const rootCategories = await this.categoryRepository.findAll({
      skip: 0,
      take: 100,
      where: { parentId: null, isActive: true },
      orderBy: { order: "asc" },
    });

    return rootCategories;
  }
}
