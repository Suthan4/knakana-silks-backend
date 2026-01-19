import { injectable, inject } from "tsyringe";
import { IHomeSectionRepository } from "../../infrastructure/interface/Ihomesectionrepository.js";
import { SectionType } from "@/generated/prisma/enums.js";
import type {
  SectionMediaDTO,
  SectionCTADTO,
} from "../dtos/home_section.dtos.js";

@injectable()
export class HomeSectionService {
  constructor(
    @inject("IHomeSectionRepository")
    private homeSectionRepository: IHomeSectionRepository
  ) {}

  async createHomeSection(data: {
    // Basic Info
    type: SectionType;
    title: string;
    subtitle?: string;
    description?: string;
    customTypeName?: string;

    // Layout & Styling
    backgroundColor?: string;
    textColor?: string;
    layout?: string;
    columns?: number;

    // Display Settings
    isActive?: boolean;
    order?: number;
    limit?: number;
    showTitle?: boolean;
    showSubtitle?: boolean;

    // Relations
    productIds?: string[];
    categoryIds?: string[];
    media?: SectionMediaDTO[];
    ctaButtons?: SectionCTADTO[];
  }) {
    // Create the section
    const section = await this.homeSectionRepository.create({
      type: data.type,
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      customTypeName: data.customTypeName,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      layout: data.layout || "grid",
      columns: data.columns || 4,
      isActive: data.isActive ?? true,
      order: data.order ?? 0,
      limit: data.limit ?? 8,
      showTitle: data.showTitle ?? true,
      showSubtitle: data.showSubtitle ?? true,
    });

    // Add media if provided
    if (data.media && data.media.length > 0) {
      await this.homeSectionRepository.addMedia(section.id, data.media);
    }

    // Add CTA buttons if provided
    if (data.ctaButtons && data.ctaButtons.length > 0) {
      await this.homeSectionRepository.addCTAButtons(
        section.id,
        data.ctaButtons
      );
    }

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
      // Basic Info
      type?: SectionType;
      title?: string;
      subtitle?: string | null;
      description?: string | null;
      customTypeName?: string | null;

      // Layout & Styling
      backgroundColor?: string | null;
      textColor?: string | null;
      layout?: string;
      columns?: number;

      // Display Settings
      isActive?: boolean;
      order?: number;
      limit?: number;
      showTitle?: boolean;
      showSubtitle?: boolean;

      // Relations
      productIds?: string[];
      categoryIds?: string[];
      media?: SectionMediaDTO[];
      ctaButtons?: SectionCTADTO[];
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
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.customTypeName !== undefined)
      updateData.customTypeName = data.customTypeName;
    if (data.backgroundColor !== undefined)
      updateData.backgroundColor = data.backgroundColor;
    if (data.textColor !== undefined) updateData.textColor = data.textColor;
    if (data.layout !== undefined) updateData.layout = data.layout;
    if (data.columns !== undefined) updateData.columns = data.columns;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.order !== undefined) updateData.order = data.order;
    if (data.limit !== undefined) updateData.limit = data.limit;
    if (data.showTitle !== undefined) updateData.showTitle = data.showTitle;
    if (data.showSubtitle !== undefined)
      updateData.showSubtitle = data.showSubtitle;

    if (Object.keys(updateData).length > 0) {
      await this.homeSectionRepository.update(sectionId, updateData);
    }

    // Update media if provided
    if (data.media !== undefined) {
      // Remove all existing media
      await this.homeSectionRepository.removeAllMedia(sectionId);
      // Add new media
      if (data.media.length > 0) {
        await this.homeSectionRepository.addMedia(sectionId, data.media);
      }
    }

    // Update CTA buttons if provided
    if (data.ctaButtons !== undefined) {
      // Remove all existing CTAs
      await this.homeSectionRepository.removeAllCTAButtons(sectionId);
      // Add new CTAs
      if (data.ctaButtons.length > 0) {
        await this.homeSectionRepository.addCTAButtons(
          sectionId,
          data.ctaButtons
        );
      }
    }

    // FIXED: Use 'set' operation directly instead of remove + add
    if (data.productIds !== undefined) {
      // Use 'set' to replace all products in one operation
      await this.homeSectionRepository.addProducts(
        sectionId,
        data.productIds.map((id) => BigInt(id))
      );
    }

    // FIXED: Use 'set' operation directly instead of remove + add
    if (data.categoryIds !== undefined) {
      // Use 'set' to replace all categories in one operation
      await this.homeSectionRepository.addCategories(
        sectionId,
        data.categoryIds.map((id) => BigInt(id))
      );
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
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.type) where.type = params.type;

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