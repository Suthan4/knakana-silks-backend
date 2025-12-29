import { Shipment, Prisma } from "@/generated/prisma/client.js";

export type ShipmentWithOrder = Prisma.ShipmentGetPayload<{
  include: {
    order: {
      include: {
        user: true;
        shippingAddress: true;
      };
    };
  };
}>;

export interface IShipmentRepository {
  findById(id: bigint): Promise<ShipmentWithOrder | null>;
  findByOrderId(orderId: bigint): Promise<Shipment | null>;
  findByShiprocketOrderId(shiprocketOrderId: string): Promise<Shipment | null>;
  findByTrackingNumber(trackingNumber: string): Promise<Shipment | null>;
  create(data: {
    orderId: bigint;
    shiprocketOrderId?: string;
    trackingNumber?: string;
    courierName?: string;
    estimatedDelivery?: Date;
  }): Promise<Shipment>;
  update(id: bigint, data: Partial<Shipment>): Promise<Shipment>;
  updateByOrderId(orderId: bigint, data: Partial<Shipment>): Promise<Shipment>;
}
