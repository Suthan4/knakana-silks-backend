import { inject, injectable } from "tsyringe";
import { Warehouse, Stock, PrismaClient } from "@/generated/prisma/client.js";
import { IWarehouseRepository } from "../interface/Iwarehouserepository.js";

@injectable()
export class WarehouseRepository implements IWarehouseRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({
      where: { id },
    });
  }

  async findByCode(code: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({
      where: { code },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.warehouse.count({ where });
  }

  async create(data: {
    name: string;
    code: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    isActive: boolean;
  }): Promise<Warehouse> {
    return this.prisma.warehouse.create({
      data,
    });
  }

  async update(id: bigint, data: Partial<Warehouse>): Promise<Warehouse> {
    return this.prisma.warehouse.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.warehouse.delete({ where: { id } });
  }

  async findActive(): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async hasStock(warehouseId: bigint): Promise<boolean> {
    const count = await this.prisma.stock.count({
      where: { warehouseId },
    });
    return count > 0;
  }

  async countStock(params: {
    warehouseId: bigint;
    search?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    const where: any = {
      warehouseId: params.warehouseId,
    };

    // ✅ Date filter (partial allowed)
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = params.startDate;
      if (params.endDate) where.createdAt.lte = params.endDate;
    }

    // ✅ Global Search in DB (not pagination limited)
    if (params.search) {
      where.OR = [
        {
          product: {
            name: { contains: params.search, mode: "insensitive" },
          },
        },
        {
          variant: {
            sku: { contains: params.search, mode: "insensitive" },
          },
        },
      ];
    }

    return this.prisma.stock.count({ where });
  }

  async getStock(params: {
    warehouseId: bigint;
    skip: number;
    take: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<Stock[]> {
    const where: any = {
      warehouseId: params.warehouseId,
    };
    // ✅ Date filter (partial allowed)
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = params.startDate;
      if (params.endDate) where.createdAt.lte = params.endDate;
    }

    // ✅ Global Search in DB
    if (params.search) {
      where.OR = [
        {
          product: {
            name: { contains: params.search, mode: "insensitive" },
          },
        },
        {
          variant: {
            sku: { contains: params.search, mode: "insensitive" },
          },
        },
      ];
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";
    
    return this.prisma.stock.findMany({
      where,
      include: {
        product: {
          include: {
            media: {
              take: 1,
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          },
        },
        variant: true,
      },
    });
  }
}
