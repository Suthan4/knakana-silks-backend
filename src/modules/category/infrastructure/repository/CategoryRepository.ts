import { inject, injectable } from "tsyringe";
import { Category, CategoryPlacement, Prisma, PrismaClient } from "@/generated/prisma/client.js";
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
        parentPlacements: {include: { parent: true }},
        childPlacements: {
          include:   { child: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { slug },
      include: {
        parentPlacements: {include: { parent: true }},
        childPlacements: {
          include:   { child: true },
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
        parentPlacements: {include: { parent: true }},
        childPlacements: {
          include:   { child: true },
          orderBy: { order: "asc" },
        },
        _count: { select: { products: true } },
      },
    });
  }

async findAllWithActiveProductCount(params: {
    skip:    number;
    take:    number;
    where?:  Prisma.CategoryWhereInput;
    orderBy?: Prisma.CategoryOrderByWithRelationInput;
  }): Promise<Category[]> {
    return this.prisma.category.findMany({
      skip:    params.skip,
      take:    params.take,
      where:   params.where,
      orderBy: params.orderBy,
      include: {
        // Parents this category is placed under
        parentPlacements: {
          include: { parent: true },
        },
        // Children placed under this category (depth 1)
        childPlacements: {
          where:   { child: { isActive: true } },
          orderBy: { order: "asc" },
          include: {
            child: {
              include: {
                // depth 2
                childPlacements: {
                  where:   { child: { isActive: true } },
                  orderBy: { order: "asc" },
                  include: {
                    child: {
                      include: {
                        // depth 3
                        childPlacements: {
                          where:   { child: { isActive: true } },
                          orderBy: { order: "asc" },
                          include: {
                            child: {
                              include: {
                                _count: {
                                  select: { products: { where: { isActive: true } } },
                                },
                              },
                            },
                          },
                        },
                        _count: {
                          select: { products: { where: { isActive: true } } },
                        },
                      },
                    },
                  },
                },
                _count: {
                  select: { products: { where: { isActive: true } } },
                },
              },
            },
          },
        },
        _count: {
          select: { products: { where: { isActive: true } } },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.category.count({ where });
  }

  async findChildren(parentId: bigint): Promise<Category[]> {
    const placements = await this.prisma.categoryPlacement.findMany({
      where:   { parentId, child: { isActive: true } },
      include: { child: true },
      orderBy: { order: "asc" },
    });

    if (placements.length > 0) {
      return placements.map((p) => p.child);
    }

    return this.prisma.category.findMany({
      where:   { parentId, isActive: true },
      orderBy: { order: "asc" },
    });
  }

  async findWithChildren(id: bigint): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        childPlacements: {
          where:   { child: { isActive: true } },
          orderBy: { order: "asc" },
          include: {
            child: {
              include: {
                childPlacements: {
                  where:   { child: { isActive: true } },
                  orderBy: { order: "asc" },
                },
              },
            },
          },
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
    return this.prisma.category.create({data});
  }

  async update(id: bigint, data: Partial<Category>): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

    // ── Writes: Placement ───────────────────────────────────────────────

  async createPlacement(
    parentId: bigint,
    childId: bigint,
    order: number,
    includeChildren: boolean = true
  ): Promise<CategoryPlacement> {
    return this.prisma.categoryPlacement.create({
      data: { parentId, childId, order, includeChildren },
    });
  }

  async findPlacement(parentId: bigint, childId: bigint): Promise<CategoryPlacement | null> {
    return this.prisma.categoryPlacement.findUnique({
      where: { parentId_childId: { parentId, childId } },
    });
  }

  async findPlacementById(id: bigint): Promise<CategoryPlacement | null> {
    return this.prisma.categoryPlacement.findUnique({ where: { id } });
  }

  async updatePlacement(
    id: bigint,
    data: { order?: number; includeChildren?: boolean }
  ): Promise<CategoryPlacement> {
    return this.prisma.categoryPlacement.update({ where: { id }, data });
  }

  async deletePlacement(id: bigint): Promise<void> {
    await this.prisma.categoryPlacement.delete({ where: { id } });
  }

  async countPlacementsForChild(childId: bigint): Promise<number> {
    return this.prisma.categoryPlacement.count({ where: { childId } });
  }

  async findChildPlacements(parentId: bigint) {
    return this.prisma.categoryPlacement.findMany({
      where: { parentId },
      include: { child: true },
      orderBy: { order: "asc" },
    });
  }

  async findParentPlacements(childId: bigint) {
    return this.prisma.categoryPlacement.findMany({
      where: { childId },
      include: { parent: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DESCENDANT HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Recursively collect this category + all ACTIVE descendant IDs.
   * Checks CategoryPlacement (primary) and Category.parentId (legacy).
   * Used for public product listing (customers only see active categories).
   */
  async getAllDescendantIds(
    categoryId: bigint,
    visited: Set<string> = new Set<string>()
  ): Promise<bigint[]> {
    const key = categoryId.toString();
    if (visited.has(key)) {
      return [];
    }
    visited.add(key);

    const ids: bigint[] = [categoryId];

    // 1. Placement-based children (active only)
    const placements = await this.prisma.categoryPlacement.findMany({
      where: { parentId: categoryId, child: { isActive: true } },
      select: { childId: true },
    });

    // 2. Direct parentId-based children (legacy active only)
    const directChildren = await this.prisma.category.findMany({
      where: { parentId: categoryId, isActive: true },
      select: { id: true },
    });

    const nextChildIds = new Set<string>();
    for (const p of placements) {
      nextChildIds.add(p.childId.toString());
    }
    for (const c of directChildren) {
      nextChildIds.add(c.id.toString());
    }

    for (const childIdStr of nextChildIds) {
      const childDescendantIds = await this.getAllDescendantIds(
        BigInt(childIdStr),
        visited
      );
      ids.push(...childDescendantIds);
    }

    return ids;
  }

  /**
   * Same as above but WITHOUT the isActive filter.
   * Used for admin views so inactive categories are still reachable.
   */
  async getAllDescendantIdsAdmin(
    categoryId: bigint,
    visited: Set<string> = new Set<string>()
  ): Promise<bigint[]> {
    const key = categoryId.toString();
    if (visited.has(key)) {
      return [];
    }
    visited.add(key);

    const ids: bigint[] = [categoryId];

    // 1. Placement-based children (all)
    const placements = await this.prisma.categoryPlacement.findMany({
      where: { parentId: categoryId },
      select: { childId: true },
    });

    // 2. Direct parentId-based children (all)
    const directChildren = await this.prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });

    const nextChildIds = new Set<string>();
    for (const p of placements) {
      nextChildIds.add(p.childId.toString());
    }
    for (const c of directChildren) {
      nextChildIds.add(c.id.toString());
    }

    for (const childIdStr of nextChildIds) {
      const childDescendantIds = await this.getAllDescendantIdsAdmin(
        BigInt(childIdStr),
        visited
      );
      ids.push(...childDescendantIds);
    }

    return ids;
  }

  /** Public-facing: active categories only (by slug). */
  async getCategoryWithDescendants(slug: string): Promise<{
    category:      Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.findBySlug(slug);
    if (!category) return null;

    const descendantIds = await this.getAllDescendantIds(category.id);
    return { category, descendantIds };
  }

  /** Public-facing: active categories only (by ID). */
  async getCategoryWithDescendantsById(id: bigint): Promise<{
    category:      Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.findById(id);
    if (!category) return null;

    const descendantIds = await this.getAllDescendantIds(category.id);
    return { category, descendantIds };
  }

  /** Admin-facing: includes inactive categories (by slug). */
  async getCategoryWithDescendantsAdmin(slug: string): Promise<{
    category:      Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.prisma.category.findUnique({
      where:   { slug },
      include: {
        parentPlacements:   { include: { parent: true } },
        childPlacements:    { orderBy: { order: "asc" } }, // no isActive filter
      },
    });

    if (!category) return null;

    const descendantIds = await this.getAllDescendantIdsAdmin(category.id);
    return { category, descendantIds };
  }

  /** Admin-facing: includes inactive categories (by ID). */
  async getCategoryWithDescendantsByIdAdmin(id: bigint): Promise<{
    category:      Category;
    descendantIds: bigint[];
  } | null> {
    const category = await this.prisma.category.findUnique({
      where:   { id },
      include: {
        parentPlacements:   { include: { parent: true } },
        childPlacements:    { orderBy: { order: "asc" } },
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

  async isAncestor(categoryId: bigint, candidateAncestorId: bigint): Promise<boolean> {
    if (categoryId === candidateAncestorId) return true;

    const parents = await this.prisma.categoryPlacement.findMany({
      where: { childId: categoryId },
      select: { parentId: true },
    });

    for (const p of parents) {
      if (await this.isAncestor(p.parentId, candidateAncestorId)) return true;
    }

    return false;
  }
}