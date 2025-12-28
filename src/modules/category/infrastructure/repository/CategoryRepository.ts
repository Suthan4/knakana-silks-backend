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
        children: true,
      },
    });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: true,
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
        children: true,
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
        children: true,
      },
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  async findChildren(parentId: bigint): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { parentId },
      orderBy: { order: "asc" },
    });
  }

  async findWithChildren(id: bigint): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        children: {
          include: {
            children: true,
          },
        },
      },
    });
  }
}
