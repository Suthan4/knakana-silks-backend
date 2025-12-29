import { injectable, inject } from "tsyringe";
import { IHomeSectionRepository } from "../../infrastructure/interface/Ihomesectionrepository.js";
import { SectionType } from "@/generated/prisma/enums.js";

@injectable()
export class HomeSectionService {
  constructor(
    @inject("IHomeSectionRepository")
    private homeSectionRepository: IHomeSectionRepository
  ) {}

  async createHomeSection(data: {
    type: SectionType;
    title: string;
    subtitle?: string;
    isActive?: boolean;
    order?: number;
    limit?: number;
    productIds?: string[];
    categoryIds?: string[];
  }) {
    const section = await this.homeSectionRepository.create({
      type: data.type,
      title: data.title,
      subtitle: data.subtitle,
      isActive: data.isActive ?? true,
      order: data.order ?? 0,
      limit: data.limit ?? 8,
    });

    // Add products if provided
    if (data.productIds && data.productIds.length > 0) {
      await this.homeSectionRepository.addProducts(
        section.id,
        data.productIds.map((id) => BigInt(id))
      );
    }

    // Add categories if provided
    if (data.categoryIds && data.categoryIds.length > 0) {
      await this.homeSectionRepository.addCategories(
        section.id,
        data.categoryIds.map((id) => BigInt(id))
      );
    }

    return this.homeSectionRepository.findById(section.id);
  }

  async updateHomeSection(
    id: string,
    data: {
      type?: SectionType;
      title?: string;
      subtitle?: string | null;
      isActive?: boolean;
      order?: number;
      limit?: number;
      productIds?: string[];
      categoryIds?: string[];
    }
  ) {
    const sectionId = BigInt(id);

    const section = await this.homeSectionRepository.findById(sectionId);
    if (!section) {
      throw new Error("Home section not found");
    }

    // Update basic fields
    const updateData: any = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.subtitle !== undefined) updateData.subtitle = data.subtitle;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.order !== undefined) updateData.order = data.order;
    if (data.limit !== undefined) updateData.limit = data.limit;

    if (Object.keys(updateData).length > 0) {
      await this.homeSectionRepository.update(sectionId, updateData);
    }

    // Update products if provided
    if (data.productIds !== undefined) {
      // Remove all existing products
      const existingProductIds = section.products.map((p) => p.id);
      if (existingProductIds.length > 0) {
        await this.homeSectionRepository.removeProducts(
          sectionId,
          existingProductIds
        );
      }
      // Add new products
      if (data.productIds.length > 0) {
        await this.homeSectionRepository.addProducts(
          sectionId,
          data.productIds.map((id) => BigInt(id))
        );
      }
    }

    // Update categories if provided
    if (data.categoryIds !== undefined) {
      // Remove all existing categories
      const existingCategoryIds = section.categories.map((c) => c.id);
      if (existingCategoryIds.length > 0) {
        await this.homeSectionRepository.removeCategories(
          sectionId,
          existingCategoryIds
        );
      }
      // Add new categories
      if (data.categoryIds.length > 0) {
        await this.homeSectionRepository.addCategories(
          sectionId,
          data.categoryIds.map((id) => BigInt(id))
        );
      }
    }

    return this.homeSectionRepository.findById(sectionId);
  }

  async deleteHomeSection(id: string) {
    const sectionId = BigInt(id);
    const section = await this.homeSectionRepository.findById(sectionId);

    if (!section) {
      throw new Error("Home section not found");
    }

    await this.homeSectionRepository.delete(sectionId);
  }

  async getHomeSection(id: string) {
    const section = await this.homeSectionRepository.findById(BigInt(id));
    if (!section) {
      throw new Error("Home section not found");
    }
    return section;
  }

  async getHomeSections(params: {
    page: number;
    limit: number;
    isActive?: boolean;
    type?: SectionType;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.type) {
      where.type = params.type;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "order"] = params.sortOrder || "asc";

    const [sections, total] = await Promise.all([
      this.homeSectionRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.homeSectionRepository.count(where),
    ]);

    return {
      sections,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getActiveSections() {
    return this.homeSectionRepository.findActive();
  }
}
