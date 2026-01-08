import { HomeSection, Prisma } from "@/generated/prisma/client.js";
import type {
  SectionMediaDTO,
  SectionCTADTO,
} from "../../application/dtos/home_section.dtos.js";

export type HomeSectionWithRelations = Prisma.HomeSectionGetPayload<{
  include: {
    products: {
      include: {
        media: true;
        stock: true;
        category: true;
      };
    };
    categories: {
      include: {
        children: true;
      };
    };
    media: true;
    ctaButtons: true;
  };
}>;


export interface IHomeSectionRepository {
  // Basic CRUD
  findById(id: bigint): Promise<HomeSectionWithRelations | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<HomeSectionWithRelations[]>;
  count(where?: any): Promise<number>;
  create(data: {
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
  }): Promise<HomeSection>;
  update(id: bigint, data: Partial<HomeSection>): Promise<HomeSection>;
  delete(id: bigint): Promise<void>;
  findActive(): Promise<HomeSectionWithRelations[]>;

  // Product Relations
  addProducts(sectionId: bigint, productIds: bigint[]): Promise<void>;
  removeProducts(sectionId: bigint, productIds: bigint[]): Promise<void>;

  // Category Relations
  addCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void>;
  removeCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void>;

  // Media Management
  addMedia(sectionId: bigint, media: SectionMediaDTO[]): Promise<void>;
  removeAllMedia(sectionId: bigint): Promise<void>;

  // CTA Button Management
  addCTAButtons(sectionId: bigint, buttons: SectionCTADTO[]): Promise<void>;
  removeAllCTAButtons(sectionId: bigint): Promise<void>;
}
