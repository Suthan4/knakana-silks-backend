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

  async getStock(warehouseId: bigint): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { warehouseId },
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
