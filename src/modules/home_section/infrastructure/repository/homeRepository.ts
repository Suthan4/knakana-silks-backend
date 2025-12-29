import { inject, injectable } from "tsyringe";
import { HomeSection, PrismaClient } from "@/generated/prisma/client.js";
import {
  HomeSectionWithRelations,
  IHomeSectionRepository,
} from "../interface/Ihomesectionrepository.js";

@injectable()
export class HomeSectionRepository implements IHomeSectionRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<HomeSectionWithRelations | null> {
    return this.prisma.homeSection.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            images: { take: 1, orderBy: { order: "asc" } },
            stock: true,
            category: true,
          },
        },
        categories: {
          include: {
            children: true,
          },
        },
      },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<HomeSectionWithRelations[]> {
    return this.prisma.homeSection.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        products: {
          include: {
            images: { take: 1, orderBy: { order: "asc" } },
            stock: true,
            category: true,
          },
        },
        categories: {
          include: {
            children: true,
          },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.homeSection.count({ where });
  }

  async create(data: {
    type: any;
    title: string;
    subtitle?: string;
    isActive: boolean;
    order: number;
    limit: number;
  }): Promise<HomeSection> {
    return this.prisma.homeSection.create({
      data,
    });
  }

  async update(id: bigint, data: Partial<HomeSection>): Promise<HomeSection> {
    return this.prisma.homeSection.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.homeSection.delete({ where: { id } });
  }

  async findActive(): Promise<HomeSectionWithRelations[]> {
    return this.prisma.homeSection.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: {
        products: {
          include: {
            images: { take: 1, orderBy: { order: "asc" } },
            stock: true,
            category: true,
          },
        },
        categories: {
          include: {
            children: true,
          },
        },
      },
    });
  }

  async addProducts(sectionId: bigint, productIds: bigint[]): Promise<void> {
    await this.prisma.homeSection.update({
      where: { id: sectionId },
      data: {
        products: {
          connect: productIds.map((id) => ({ id })),
        },
      },
    });
  }

  async removeProducts(sectionId: bigint, productIds: bigint[]): Promise<void> {
    await this.prisma.homeSection.update({
      where: { id: sectionId },
      data: {
        products: {
          disconnect: productIds.map((id) => ({ id })),
        },
      },
    });
  }

  async addCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void> {
    await this.prisma.homeSection.update({
      where: { id: sectionId },
      data: {
        categories: {
          connect: categoryIds.map((id) => ({ id })),
        },
      },
    });
  }

  async removeCategories(
    sectionId: bigint,
    categoryIds: bigint[]
  ): Promise<void> {
    await this.prisma.homeSection.update({
      where: { id: sectionId },
      data: {
        categories: {
          disconnect: categoryIds.map((id) => ({ id })),
        },
      },
    });
  }
}
