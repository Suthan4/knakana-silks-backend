import { inject, injectable } from "tsyringe";
import { HomeSection, PrismaClient } from "@/generated/prisma/client.js";
import {
  HomeSectionWithRelations,
  IHomeSectionRepository,
} from "../interface/Ihomesectionrepository.js";
import type {
  SectionMediaDTO,
  SectionCTADTO,
} from "../../application/dtos/home_section.dtos.js";

@injectable()
export class HomeSectionRepository implements IHomeSectionRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<HomeSectionWithRelations | null> {
    return this.prisma.homeSection.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            media: {
              where: {
                isActive: true,
                type: "IMAGE",
              },
              take: 1,
              orderBy: { order: "asc" },
            },
            stock: true,
            category: true,
          },
        },
        categories: {
          include: {
            children: true,
          },
        },
        media: {
          orderBy: { order: "asc" },
        },
        ctaButtons: {
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
  }): Promise<HomeSectionWithRelations[]> {
    return this.prisma.homeSection.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        products: {
          include: {
            media: {
              where: {
                isActive: true,
                type: "IMAGE",
              },
              take: 1,
              orderBy: { order: "asc" },
            },
            stock: true,
            category: true,
          },
        },
        categories: {
          include: {
            children: true,
          },
        },
        media: {
          orderBy: { order: "asc" },
        },
        ctaButtons: {
          orderBy: { order: "asc" },
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
    description?: string;
    customTypeName?: string;
    backgroundColor?: string;
    textColor?: string;
    layout: string;
    columns: number;
    isActive: boolean;
    order: number;
    limit: number;
    showTitle: boolean;
    showSubtitle: boolean;
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
            media: {
              where: {
                isActive: true,
                type: "IMAGE",
              },
              take: 1,
              orderBy: { order: "asc" },
            },
            stock: true,
            category: true,
          },
        },
        categories: {
          include: {
            children: true,
          },
        },
        media: {
          orderBy: { order: "asc" },
        },
        ctaButtons: {
          orderBy: { order: "asc" },
        },
      },
    });
  }

  // Product Relations
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

  // Category Relations
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

  // Media Management
  async addMedia(sectionId: bigint, media: SectionMediaDTO[]): Promise<void> {
    await this.prisma.sectionMedia.createMany({
      data: media.map((m) => ({
        sectionId,
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        altText: m.altText,
        title: m.title,
        order: m.order,
        overlayTitle: m.overlayTitle,
        overlaySubtitle: m.overlaySubtitle,
        overlayPosition: m.overlayPosition,
      })),
    });
  }

  async removeAllMedia(sectionId: bigint): Promise<void> {
    await this.prisma.sectionMedia.deleteMany({
      where: { sectionId },
    });
  }

  // CTA Button Management
  async addCTAButtons(
    sectionId: bigint,
    buttons: SectionCTADTO[]
  ): Promise<void> {
    await this.prisma.sectionCTA.createMany({
      data: buttons.map((b) => ({
        sectionId,
        text: b.text,
        url: b.url,
        style: b.style,
        icon: b.icon,
        order: b.order,
        openNewTab: b.openNewTab,
      })),
    });
  }

  async removeAllCTAButtons(sectionId: bigint): Promise<void> {
    await this.prisma.sectionCTA.deleteMany({
      where: { sectionId },
    });
  }
}
