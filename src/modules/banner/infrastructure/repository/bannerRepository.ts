import { inject, injectable } from "tsyringe";
import { Banner, PrismaClient } from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";
import { IBannerRepository } from "../interface/Ibannerrepository.js";

@injectable()
export class BannerRepository implements IBannerRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<Banner | null> {
    return this.prisma.banner.findUnique({
      where: { id },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Banner[]> {
    return this.prisma.banner.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.banner.count({ where });
  }

  async create(data: {
    title: string;
    type: MediaType; // NEW
    url: string; // UPDATED
    key?: string; // NEW
    thumbnailUrl?: string; // NEW
    link?: string;
    text?: string;
    mimeType?: string; // NEW
    fileSize?: bigint; // NEW
    duration?: number; // NEW
    width?: number; // NEW
    height?: number; // NEW
    isActive: boolean;
    order: number;
  }): Promise<Banner> {
    return this.prisma.banner.create({
      data: {
        title: data.title,
        type: data.type,
        url: data.url,
        key: data.key,
        thumbnailUrl: data.thumbnailUrl,
        link: data.link,
        text: data.text,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        duration: data.duration,
        width: data.width,
        height: data.height,
        isActive: data.isActive,
        order: data.order,
      },
    });
  }

  async update(id: bigint, data: Partial<Banner>): Promise<Banner> {
    return this.prisma.banner.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.banner.delete({ where: { id } });
  }

  async findActive(): Promise<Banner[]> {
    return this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }
}
