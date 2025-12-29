import { HomeSection, Prisma } from "@/generated/prisma/client.js";

export type HomeSectionWithRelations = Prisma.HomeSectionGetPayload<{
  include: {
    products: {
      include: {
        images: true;
        stock: true;
        category: true;
      };
    };
    categories: {
      include: {
        children: true;
      };
    };
  };
}>;

export interface IHomeSectionRepository {
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
    isActive: boolean;
    order: number;
    limit: number;
  }): Promise<HomeSection>;
  update(id: bigint, data: Partial<HomeSection>): Promise<HomeSection>;
  delete(id: bigint): Promise<void>;
  findActive(): Promise<HomeSectionWithRelations[]>;
  addProducts(sectionId: bigint, productIds: bigint[]): Promise<void>;
  removeProducts(sectionId: bigint, productIds: bigint[]): Promise<void>;
  addCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void>;
  removeCategories(sectionId: bigint, categoryIds: bigint[]): Promise<void>;
}
