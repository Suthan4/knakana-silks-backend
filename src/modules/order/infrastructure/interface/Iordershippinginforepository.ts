import { OrderShippingInfo } from "@/generated/prisma/client.js";

export interface IOrderShippingInfoRepository {
  /**
   * Find shipping info by order ID
   */
  findByOrderId(orderId: bigint): Promise<OrderShippingInfo | null>;

  /**
   * Find shipping info by ID
   */
  findById(id: bigint): Promise<OrderShippingInfo | null>;

  /**
   * Create shipping info for order
   */
  create(data: {
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
    selectedCourierCompanyId: number,
    selectedCourierName: string,
    selectedCourierCharge: number,
    selectedCourierEtd: string,
  }): Promise<OrderShippingInfo>;

  /**
   * Update shipping info
   */
  update(
    id: bigint,
    data: Partial<OrderShippingInfo>
  ): Promise<OrderShippingInfo>;

  /**
   * Delete shipping info (rarely used)
   */
  delete(id: bigint): Promise<void>;

  /**
   * Find all shipping info with warehouse filter
   */
  findByWarehouseId(
    warehouseId: bigint,
    params: { skip: number; take: number }
  ): Promise<OrderShippingInfo[]>;

  /**
   * Count orders by warehouse
   */
  countByWarehouseId(warehouseId: bigint): Promise<number>;
  
  updateByOrderId(
  orderId: bigint,
  data: Partial<OrderShippingInfo>
): Promise<OrderShippingInfo>;
}