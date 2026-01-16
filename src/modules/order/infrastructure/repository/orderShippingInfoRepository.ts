import { inject, injectable } from "tsyringe";
import {
  OrderShippingInfo,
  PrismaClient,
} from "@/generated/prisma/client.js";
import { IOrderShippingInfoRepository } from "../interface/Iordershippinginforepository.js";

@injectable()
export class OrderShippingInfoRepository
  implements IOrderShippingInfoRepository
{
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  /**
   * Find shipping info by order ID
   */
  async findByOrderId(orderId: bigint): Promise<OrderShippingInfo | null> {
    return this.prisma.orderShippingInfo.findUnique({
      where: { orderId },
    });
  }

  /**
   * Find shipping info by ID
   */
  async findById(id: bigint): Promise<OrderShippingInfo | null> {
    return this.prisma.orderShippingInfo.findUnique({
      where: { id },
    });
  }

  /**
   * Create shipping info for order
   */
  async create(data: {
    orderId: bigint;
    warehouseId: bigint;
    warehouseName: string;
    warehouseCode: string;
    pickupAddress: string;
    pickupAddressLine2?: string | null;
    pickupCity: string;
    pickupState: string;
    pickupPincode: string;
    pickupCountry: string;
    pickupPhone?: string | null;
    pickupEmail?: string | null;
    pickupContactPerson?: string | null;
    totalWeight: number;
    volumetricWeight: number;
    chargeableWeight: number;
    length: number;
    breadth: number;
    height: number;
  }): Promise<OrderShippingInfo> {
    return this.prisma.orderShippingInfo.create({
      data: {
        orderId: data.orderId,
        warehouseId: data.warehouseId,
        warehouseName: data.warehouseName,
        warehouseCode: data.warehouseCode,
        pickupAddress: data.pickupAddress,
        pickupAddressLine2: data.pickupAddressLine2,
        pickupCity: data.pickupCity,
        pickupState: data.pickupState,
        pickupPincode: data.pickupPincode,
        pickupCountry: data.pickupCountry,
        pickupPhone: data.pickupPhone,
        pickupEmail: data.pickupEmail,
        pickupContactPerson: data.pickupContactPerson,
        totalWeight: data.totalWeight,
        volumetricWeight: data.volumetricWeight,
        chargeableWeight: data.chargeableWeight,
        length: data.length,
        breadth: data.breadth,
        height: data.height,
      },
    });
  }

  /**
   * Update shipping info
   */
  async update(
    id: bigint,
    data: Partial<OrderShippingInfo>
  ): Promise<OrderShippingInfo> {
    return this.prisma.orderShippingInfo.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete shipping info (rarely used)
   */
  async delete(id: bigint): Promise<void> {
    await this.prisma.orderShippingInfo.delete({
      where: { id },
    });
  }

  /**
   * Find all shipping info with warehouse filter
   */
  async findByWarehouseId(
    warehouseId: bigint,
    params: { skip: number; take: number }
  ): Promise<OrderShippingInfo[]> {
    return this.prisma.orderShippingInfo.findMany({
      where: { warehouseId },
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Count orders by warehouse
   */
  async countByWarehouseId(warehouseId: bigint): Promise<number> {
    return this.prisma.orderShippingInfo.count({
      where: { warehouseId },
    });
  }
}