import { Banner } from "@/generated/prisma/client.js";

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
    image: string;
    link?: string;
    text?: string;
    isActive: boolean;
    order: number;
  }): Promise<Banner>;
  update(id: bigint, data: Partial<Banner>): Promise<Banner>;
  delete(id: bigint): Promise<void>;
  findActive(): Promise<Banner[]>;
}
