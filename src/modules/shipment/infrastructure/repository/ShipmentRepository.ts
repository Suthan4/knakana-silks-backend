import { inject, injectable } from "tsyringe";
import { Shipment, PrismaClient } from "@/generated/prisma/client.js";
import {
  IShipmentRepository,
  ShipmentWithOrder,
} from "../interface/Ishipmentrepository.js";

@injectable()
export class ShipmentRepository implements IShipmentRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<ShipmentWithOrder | null> {
    return this.prisma.shipment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            user: true,
            shippingAddress: true,
          },
        },
      },
    });
  }

  async findByOrderId(orderId: bigint): Promise<Shipment | null> {
    return this.prisma.shipment.findUnique({
      where: { orderId },
    });
  }

  async findByShiprocketOrderId(
    shiprocketOrderId: string
  ): Promise<Shipment | null> {
    return this.prisma.shipment.findUnique({
      where: { shiprocketOrderId },
    });
  }

  async findByTrackingNumber(trackingNumber: string): Promise<Shipment | null> {
    return this.prisma.shipment.findFirst({
      where: { trackingNumber },
    });
  }

  async create(data: {
    orderId: bigint;
    shiprocketOrderId?: string;
    shiprocketShipmentId?: string;
    trackingNumber?: string;
    courierName?: string;
    estimatedDelivery?: Date;
  }): Promise<Shipment> {
    return this.prisma.shipment.create({
      data: {
        orderId: data.orderId,
        shiprocketOrderId: data.shiprocketOrderId,
        shiprocketShipmentId: data.shiprocketShipmentId,
        trackingNumber: data.trackingNumber,
        courierName: data.courierName,
        estimatedDelivery: data.estimatedDelivery,
      },
    });
  }

  async update(id: bigint, data: Partial<Shipment>): Promise<Shipment> {
    return this.prisma.shipment.update({
      where: { id },
      data,
    });
  }

  async updateByOrderId(
    orderId: bigint,
    data: Partial<Shipment>
  ): Promise<Shipment> {
    return this.prisma.shipment.update({
      where: { orderId },
      data,
    });
  }
}
