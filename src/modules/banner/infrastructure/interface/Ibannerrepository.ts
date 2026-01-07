import { Banner } from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";

export interface IBannerRepository {
  findById(id: bigint): Promise<Banner | null>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Banner[]>;
  count(where?: any): Promise<number>;
  create(data: {
    title: string;
    type: MediaType; // NEW
    url: string; // UPDATED: Changed from 'image'
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
  }): Promise<Banner>;
  update(id: bigint, data: Partial<Banner>): Promise<Banner>;
  delete(id: bigint): Promise<void>;
  findActive(): Promise<Banner[]>;
}
