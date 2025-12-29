import { injectable, inject } from "tsyringe";
import { IBannerRepository } from "../../infrastructure/interface/Ibannerrepository.js";
import { Banner } from "@/generated/prisma/client.js";

@injectable()
export class BannerService {
  constructor(
    @inject("IBannerRepository")
    private bannerRepository: IBannerRepository
  ) {}

  async createBanner(data: {
    title: string;
    image: string;
    link?: string;
    text?: string;
    isActive?: boolean;
    order?: number;
  }): Promise<Banner> {
    const banner = await this.bannerRepository.create({
      title: data.title,
      image: data.image,
      link: data.link,
      text: data.text,
      isActive: data.isActive ?? true,
      order: data.order ?? 0,
    });

    return banner;
  }

  async updateBanner(
    id: string,
    data: {
      title?: string;
      image?: string;
      link?: string | null;
      text?: string | null;
      isActive?: boolean;
      order?: number;
    }
  ): Promise<Banner> {
    const bannerId = BigInt(id);

    const banner = await this.bannerRepository.findById(bannerId);
    if (!banner) {
      throw new Error("Banner not found");
    }

    const updated = await this.bannerRepository.update(bannerId, data);
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
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
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
