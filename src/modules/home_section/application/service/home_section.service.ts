import { injectable, inject } from "tsyringe";
import { IHomeSectionRepository } from "../../infrastructure/interface/Ihomesectionrepository.js";
import { SectionType } from "@/generated/prisma/enums.js";
import type { SectionMediaDTO, SectionCTADTO } from "../dtos/home_section.dtos.js";
import { revalidateStorefrontHome } from "@/shared/services/home-revalidation.service.js";

type HomeSectionCreateInput = {
  type: SectionType;
  title?: string | null;
  subtitle?: string;
  description?: string;
  customTypeName?: string;
  backgroundColor?: string;
  textColor?: string;
  layout?: string;
  columns?: number;
  isActive?: boolean;
  order?: number;
  limit?: number;
  showTitle?: boolean;
  showSubtitle?: boolean;
  productIds?: string[];
  categoryIds?: string[];
  media?: SectionMediaDTO[];
  ctaButtons?: SectionCTADTO[];
};

type HomeSectionUpdateInput = {
  type?: SectionType;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  customTypeName?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  layout?: string;
  columns?: number;
  isActive?: boolean;
  order?: number;
  limit?: number;
  showTitle?: boolean;
  showSubtitle?: boolean;
  productIds?: string[];
  categoryIds?: string[];
  media?: SectionMediaDTO[];
  ctaButtons?: SectionCTADTO[];
};

@injectable()
export class HomeSectionService {
  constructor(@inject("IHomeSectionRepository") private homeSectionRepository: IHomeSectionRepository) {}

  async createHomeSection(data: HomeSectionCreateInput) {
    const section = await this.homeSectionRepository.create({
      type: data.type,
      title: data.title?.trim() || null,
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
    if (data.media?.length) await this.homeSectionRepository.addMedia(section.id, data.media);
    if (data.ctaButtons?.length) await this.homeSectionRepository.addCTAButtons(section.id, data.ctaButtons);
    if (data.productIds?.length) await this.homeSectionRepository.addProducts(section.id, data.productIds.map((id) => BigInt(id)));
    if (data.categoryIds?.length) await this.homeSectionRepository.addCategories(section.id, data.categoryIds.map((id) => BigInt(id)));
    const createdSection = await this.homeSectionRepository.findById(section.id);
    void revalidateStorefrontHome();
    return createdSection;
  }

  async updateHomeSection(id: string, data: HomeSectionUpdateInput) {
    const sectionId = BigInt(id);
    const section = await this.homeSectionRepository.findById(sectionId);
    if (!section) throw new Error("Home section not found");

    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.title !== undefined) updateData.title = data.title?.trim() || null;
    if (data.subtitle !== undefined) updateData.subtitle = data.subtitle;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.customTypeName !== undefined) updateData.customTypeName = data.customTypeName;
    if (data.backgroundColor !== undefined) updateData.backgroundColor = data.backgroundColor;
    if (data.textColor !== undefined) updateData.textColor = data.textColor;
    if (data.layout !== undefined) updateData.layout = data.layout;
    if (data.columns !== undefined) updateData.columns = data.columns;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.order !== undefined) updateData.order = data.order;
    if (data.limit !== undefined) updateData.limit = data.limit;
    if (data.showTitle !== undefined) updateData.showTitle = data.showTitle;
    if (data.showSubtitle !== undefined) updateData.showSubtitle = data.showSubtitle;
    if (Object.keys(updateData).length) await this.homeSectionRepository.update(sectionId, updateData);

    if (data.media !== undefined) {
      await this.homeSectionRepository.removeAllMedia(sectionId);
      if (data.media.length) await this.homeSectionRepository.addMedia(sectionId, data.media);
    }
    if (data.ctaButtons !== undefined) {
      await this.homeSectionRepository.removeAllCTAButtons(sectionId);
      if (data.ctaButtons.length) await this.homeSectionRepository.addCTAButtons(sectionId, data.ctaButtons);
    }
    if (data.productIds !== undefined) await this.homeSectionRepository.addProducts(sectionId, data.productIds.map((id) => BigInt(id)));
    if (data.categoryIds !== undefined) await this.homeSectionRepository.addCategories(sectionId, data.categoryIds.map((id) => BigInt(id)));

    const updatedSection = await this.homeSectionRepository.findById(sectionId);
    void revalidateStorefrontHome();
    return updatedSection;
  }

  async deleteHomeSection(id: string) {
    const sectionId = BigInt(id);
    const section = await this.homeSectionRepository.findById(sectionId);
    if (!section) throw new Error("Home section not found");
    await this.homeSectionRepository.delete(sectionId);
    void revalidateStorefrontHome();
  }

  async getHomeSection(id: string) {
    const section = await this.homeSectionRepository.findById(BigInt(id));
    if (!section) throw new Error("Home section not found");
    return section;
  }

  async getHomeSections(params: { page: number; limit: number; isActive?: boolean; type?: SectionType; sortBy?: string; sortOrder?: "asc" | "desc" }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.type) where.type = params.type;
    const orderBy: any = {};
    orderBy[params.sortBy || "order"] = params.sortOrder || "asc";
    const [sections, total] = await Promise.all([
      this.homeSectionRepository.findAll({ skip, take: params.limit, where, orderBy }),
      this.homeSectionRepository.count(where),
    ]);
    return { sections, pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) } };
  }

  async getActiveSections() {
    return this.homeSectionRepository.findActive();
  }
}
