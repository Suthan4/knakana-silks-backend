import { injectable, inject } from "tsyringe";
import { IWarehouseRepository } from "../../infrastructure/interface/Iwarehouserepository.js";

@injectable()
export class WarehouseService {
  constructor(
    @inject("IWarehouseRepository")
    private warehouseRepository: IWarehouseRepository
  ) {}

  async createWarehouse(data: {
    name: string;
    code: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    isActive?: boolean;
  }) {
    // Check if code already exists
    const existing = await this.warehouseRepository.findByCode(data.code);
    if (existing) {
      throw new Error("Warehouse code already exists");
    }

    return this.warehouseRepository.create({
      name: data.name,
      code: data.code.toUpperCase(),
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      isActive: data.isActive ?? true,
    });
  }

  async updateWarehouse(
    id: string,
    data: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      pincode?: string;
      isActive?: boolean;
    }
  ) {
    const warehouseId = BigInt(id);
    const warehouse = await this.warehouseRepository.findById(warehouseId);

    if (!warehouse) {
      throw new Error("Warehouse not found");
    }

    return this.warehouseRepository.update(warehouseId, data);
  }

  async deleteWarehouse(id: string) {
    const warehouseId = BigInt(id);
    const warehouse = await this.warehouseRepository.findById(warehouseId);

    if (!warehouse) {
      throw new Error("Warehouse not found");
    }

    // Check if warehouse has any stock
    const hasStock = await this.warehouseRepository.hasStock(warehouseId);
    if (hasStock) {
      throw new Error(
        "Cannot delete warehouse with existing stock. Please transfer stock first."
      );
    }

    await this.warehouseRepository.delete(warehouseId);
  }

  async getWarehouse(id: string) {
    const warehouse = await this.warehouseRepository.findById(BigInt(id));
    if (!warehouse) {
      throw new Error("Warehouse not found");
    }
    return warehouse;
  }

  async getWarehouses(params: {
    page: number;
    limit: number;
    isActive?: boolean;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
        { city: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [warehouses, total] = await Promise.all([
      this.warehouseRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.warehouseRepository.count(where),
    ]);

    return {
      warehouses,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getActiveWarehouses() {
    return this.warehouseRepository.findActive();
  }

  async getWarehouseStock(id: string) {
    const warehouseId = BigInt(id);
    const warehouse = await this.warehouseRepository.findById(warehouseId);

    if (!warehouse) {
      throw new Error("Warehouse not found");
    }

    return this.warehouseRepository.getStock(warehouseId);
  }
}
