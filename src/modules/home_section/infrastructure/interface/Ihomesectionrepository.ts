import { HomeSection, Prisma } from "@/generated/prisma/client.js";
import type { SectionMediaDTO, SectionCTADTO } from "../../application/dtos/home_section.dtos.js";

export type HomeSectionWithRelations = Prisma.HomeSectionGetPayload<{
  include: {
    products: { include: { media: true; stock: true; category: true } };
    categories: { include: { childPlacements: { include: { child: true } } } };
    media: true;
    ctaButtons: true;
  };
}>;

export interface IHomeSectionRepository {
  findById(id: bigint): Promise<HomeSectionWithRelations | null>;
  findAll(params: { skip: number; take: number; where?: any; orderBy?: any }): Promise<HomeSectionWithRelations[]>;
  count(where?: any): Promise<number>;
  create(data: {
    type: any;
    title: string | null;
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
  addProducts(sectionId: bigint, productIds: bigint[]): Promise<void>;
  removeProducts(sectionId: bigint, productIds: bigint[]): Promise<void>;
  addCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void>;
  removeCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void>;
  addMedia(sectionId: bigint, media: SectionMediaDTO[]): Promise<void>;
  removeAllMedia(sectionId: bigint): Promise<void>;
  addCTAButtons(sectionId: bigint, buttons: SectionCTADTO[]): Promise<void>;
  removeAllCTAButtons(sectionId: bigint): Promise<void>;
}
