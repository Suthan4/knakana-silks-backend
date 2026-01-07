import { injectable, inject } from "tsyringe";
import { IBannerRepository } from "../../infrastructure/interface/Ibannerrepository.js";
import { Banner } from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";

@injectable()
export class BannerService {
  constructor(
    @inject("IBannerRepository")
    private bannerRepository: IBannerRepository
  ) {}

  async createBanner(data: {
    title: string;
    type?: MediaType; // NEW
    url: string; // UPDATED: Changed from 'image'
    key?: string; // NEW
    thumbnailUrl?: string; // NEW
    link?: string;
    text?: string;
    mimeType?: string; // NEW
    fileSize?: number; // NEW
    duration?: number; // NEW
    width?: number; // NEW
    height?: number; // NEW
    isActive?: boolean;
    order?: number;
  }): Promise<Banner> {
    const banner = await this.bannerRepository.create({
      title: data.title,
      type: data.type ?? MediaType.IMAGE,
      url: data.url,
      key: data.key,
      thumbnailUrl: data.thumbnailUrl,
      link: data.link,
      text: data.text,
      mimeType: data.mimeType,
      fileSize: data.fileSize ? BigInt(data.fileSize) : undefined,
      duration: data.duration,
      width: data.width,
      height: data.height,
      isActive: data.isActive ?? true,
      order: data.order ?? 0,
    });

    return banner;
  }

  async updateBanner(
    id: string,
    data: {
      title?: string;
      type?: MediaType; // NEW
      url?: string; // UPDATED
      key?: string; // NEW
      thumbnailUrl?: string | null; // NEW
      link?: string | null;
      text?: string | null;
      mimeType?: string; // NEW
      fileSize?: number; // NEW
      duration?: number; // NEW
      width?: number; // NEW
      height?: number; // NEW
      isActive?: boolean;
      order?: number;
    }
  ): Promise<Banner> {
    const bannerId = BigInt(id);

    const banner = await this.bannerRepository.findById(bannerId);
    if (!banner) {
      throw new Error("Banner not found");
    }

    const updateData: any = { ...data };

    // Convert fileSize to BigInt if provided
    if (data.fileSize !== undefined) {
      updateData.fileSize = BigInt(data.fileSize);
    }

    const updated = await this.bannerRepository.update(bannerId, updateData);
    return updated;
  }

  async deleteBanner(id: string): Promise<void> {
    const bannerId = BigInt(id);
    const banner = await this.bannerRepository.findById(bannerId);

    if (!banner) {
      throw new Error("Banner not found");
    }

    await this.bannerRepository.delete(bannerId);
  }

  async getBanner(id: string): Promise<Banner> {
    const banner = await this.bannerRepository.findById(BigInt(id));
    if (!banner) {
      throw new Error("Banner not found");
    }
    return banner;
  }

  async getBanners(params: {
    page: number;
    limit: number;
    type?: MediaType; // NEW: Filter by media type
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    // NEW: Filter by media type
    if (params.type !== undefined) {
      where.type = params.type;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "order"] = params.sortOrder || "asc";

    const [banners, total] = await Promise.all([
      this.bannerRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.bannerRepository.count(where),
    ]);

    return {
      banners,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getActiveBanners(): Promise<Banner[]> {
    return this.bannerRepository.findActive();
  }
}
