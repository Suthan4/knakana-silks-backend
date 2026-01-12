import { inject, injectable } from "tsyringe";
import { Category, PrismaClient } from "@/generated/prisma/client.js";
import { ICategoryRepository } from "../interface/Icategoryrepository.js";

@injectable()
export class CategoryRepository implements ICategoryRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Category[]> {
    return this.prisma.category.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.category.count({ where });
  }

  async create(data: {
    name: string;
    slug: string;
    description?: string;
    parentId?: bigint;
    metaTitle?: string;
    metaDesc?: string;
    image?: string;
    isActive: boolean;
    order: number;
  }): Promise<Category> {
    return this.prisma.category.create({
      data,
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async update(id: bigint, data: Partial<Category>): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data,
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  async findChildren(parentId: bigint): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { parentId, isActive: true },
      orderBy: { order: "asc" },
    });
  }

  async findWithChildren(id: bigint): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        children: {
          where: { isActive: true },
          include: {
            children: {
              where: { isActive: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  /**
   * ✅ NEW: Recursively get all descendant category IDs
   * This includes children, grandchildren, great-grandchildren, etc.
   */
  async getAllDescendantIds(categoryId: bigint): Promise<bigint[]> {
    const ids: bigint[] = [categoryId];

    // Get immediate children
    const children = await this.prisma.category.findMany({
      where: {
        parentId: categoryId,
        isActive: true, // Only active categories
      },
      select: { id: true },
    });

    // Recursively get descendants of each child
    for (const child of children) {
      const descendantIds = await this.getAllDescendantIds(child.id);
      ids.push(...descendantIds);
    }

    return ids;
  }

  /**
   * ✅ NEW: Get category with all descendant IDs by slug
   * Returns the category and array of all descendant IDs (including itself)
   */
  async getCategoryWithDescendants(slug: string): Promise<{
    category: Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.findBySlug(slug);

    if (!category) {
      return null;
    }

    // Get all descendant IDs (including the category itself)
    const descendantIds = await this.getAllDescendantIds(category.id);

    return {
      category,
      descendantIds,
    };
  }

  /**
   * ✅ NEW: Get multiple categories with their descendants
   * Useful for fetching multiple category trees at once
   */
  async getMultipleCategoriesWithDescendants(slugs: string[]): Promise<{
    categories: Category[];
    allDescendantIds: bigint[];
  }> {
    const categories: Category[] = [];
    const allIds = new Set<bigint>();

    for (const slug of slugs) {
      const result = await this.getCategoryWithDescendants(slug);
      if (result) {
        categories.push(result.category);
        result.descendantIds.forEach((id) => allIds.add(id));
      }
    }

    return {
      categories,
      allDescendantIds: Array.from(allIds),
    };
  }
}
