import { inject, injectable } from "tsyringe";
import { Category, PrismaClient } from "@/generated/prisma/client.js";
import { ICategoryRepository } from "../interface/Icategoryrepository.js";

@injectable()
export class CategoryRepository implements ICategoryRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // READS
  // ─────────────────────────────────────────────────────────────────────────────

  async findById(id: bigint): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where:   { isActive: true },
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
          where:   { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async findAll(params: {
    skip:     number;
    take:     number;
    where?:   any;
    orderBy?: any;
  }): Promise<Category[]> {
    return this.prisma.category.findMany({
      skip:    params.skip,
      take:    params.take,
      where:   params.where,
      orderBy: params.orderBy,
      include: {
        parent: true,
        children: {
          where:   { isActive: true },
          orderBy: { order: "asc" },
        },
        _count: { select: { products: true } },
      },
    });
  }

  async findAllWithActiveProductCount(params: {
    skip:     number;
    take:     number;
    where?:   any;
    orderBy?: any;
  }): Promise<Category[]> {
    return this.prisma.category.findMany({
      skip:    params.skip,
      take:    params.take,
      where:   params.where,
      orderBy: params.orderBy,
      include: {
        parent: true,
        children: {
          where:   { isActive: true },
          orderBy: { order: "asc" },
          include: {
            children: {
              where:   { isActive: true },
              orderBy: { order: "asc" },
              include: {
                children: {
                  where:   { isActive: true },
                  orderBy: { order: "asc" },
                },
              },
            },
            _count: {
              select: {
                products: { where: { isActive: true } },
              },
            },
          },
        },
        _count: {
          select: {
            products: { where: { isActive: true } },
          },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.category.count({ where });
  }

  async findChildren(parentId: bigint): Promise<Category[]> {
    return this.prisma.category.findMany({
      where:   { parentId, isActive: true },
      orderBy: { order: "asc" },
    });
  }

  async findWithChildren(id: bigint): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        children: {
          where:   { isActive: true },
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

  // ─────────────────────────────────────────────────────────────────────────────
  // WRITES
  // ─────────────────────────────────────────────────────────────────────────────

  async create(data: {
    name:                    string;
    slug:                    string;
    description?:            string;
    parentId?:               bigint;
    metaTitle?:              string;
    metaDesc?:               string;
    image?:                  string;
    isActive:                boolean;
    order:                   number;
    hasVideoConsultation?:   boolean;
    videoPurchasingEnabled?: boolean;
    videoConsultationNote?:  string;
  }): Promise<Category> {
    return this.prisma.category.create({
      data,
      include: {
        parent:   true,
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
          where:   { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DESCENDANT HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Recursively collect this category + all ACTIVE descendant IDs.
   * Used for public product listing (customers only see active categories).
   */
  async getAllDescendantIds(categoryId: bigint): Promise<bigint[]> {
    const ids: bigint[] = [categoryId];

    const children = await this.prisma.category.findMany({
      where:  { parentId: categoryId, isActive: true },
      select: { id: true },
    });

    for (const child of children) {
      const childIds = await this.getAllDescendantIds(child.id);
      ids.push(...childIds);
    }

    return ids;
  }

  /**
   * Same as above but WITHOUT the isActive filter.
   * Used for admin views so inactive categories are still reachable.
   */
  async getAllDescendantIdsAdmin(categoryId: bigint): Promise<bigint[]> {
    const ids: bigint[] = [categoryId];

    const children = await this.prisma.category.findMany({
      where:  { parentId: categoryId }, // no isActive filter
      select: { id: true },
    });

    for (const child of children) {
      const childIds = await this.getAllDescendantIdsAdmin(child.id);
      ids.push(...childIds);
    }

    return ids;
  }

  /** Public-facing: active categories only. */
  async getCategoryWithDescendants(slug: string): Promise<{
    category:      Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.findBySlug(slug);
    if (!category) return null;

    const descendantIds = await this.getAllDescendantIds(category.id);
    return { category, descendantIds };
  }

  /** Admin-facing: includes inactive categories. */
  async getCategoryWithDescendantsAdmin(slug: string): Promise<{
    category:      Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.prisma.category.findUnique({
      where:   { slug },
      include: {
        parent:   true,
        children: { orderBy: { order: "asc" } }, // no isActive filter
      },
    });

    if (!category) return null;

    const descendantIds = await this.getAllDescendantIdsAdmin(category.id);
    return { category, descendantIds };
  }

  /** Batch version: get multiple category trees at once. */
  async getMultipleCategoriesWithDescendants(slugs: string[]): Promise<{
    categories:      Category[];
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

    return { categories, allDescendantIds: Array.from(allIds) };
  }
}