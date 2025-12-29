import { inject, injectable } from "tsyringe";
import {
  IShiprocketRepository,
  CreateShiprocketOrderDTO,
  ShiprocketOrderResponse,
  ShiprocketOrderDetailsResponse,
  ShiprocketCancelResponse,
  CourierServiceabilityParams,
  AvailableCouriersResponse,
  AssignCourierParams,
  AWBResponse,
  PickupResponse,
  TrackingResponse,
  LabelResponse,
  ManifestResponse,
  PincodeServiceabilityParams,
  ServiceabilityResponse,
  CreateReturnOrderDTO,
  ReturnOrderResponse,
} from "../interface/IshiprocketRepository.js";
import { ShiprocketService } from "../services/shiprocket.service.js";

@injectable()
export class ShiprocketRepository implements IShiprocketRepository {
  constructor(
    @inject(ShiprocketService) private shiprocketService: ShiprocketService
  ) {}

  /**
   * Create order in Shiprocket
   */
  async createOrder(
    data: CreateShiprocketOrderDTO
  ): Promise<ShiprocketOrderResponse> {
    return this.shiprocketService.createOrder(data);
  }

  /**
   * Get order details from Shiprocket
   */
  async getOrderDetails(
    orderId: string
  ): Promise<ShiprocketOrderDetailsResponse> {
    return this.shiprocketService.getOrderDetails(orderId);
  }

  /**
   * Cancel order in Shiprocket
   */
  async cancelOrder(orderIds: number[]): Promise<ShiprocketCancelResponse> {
    return this.shiprocketService.cancelShipment(orderIds);
  }

  /**
   * Get available couriers for shipment
   */
  async getAvailableCouriers(
    params: CourierServiceabilityParams
  ): Promise<AvailableCouriersResponse> {
    return this.shiprocketService.getAvailableCouriers(params);
  }

  /**
   * Assign courier and generate AWB
   */
  async assignCourier(params: AssignCourierParams): Promise<AWBResponse> {
    return this.shiprocketService.generateAwb(params);
  }

  /**
   * Schedule pickup with courier
   */
  async schedulePickup(shipmentIds: number[]): Promise<PickupResponse> {
    return this.shiprocketService.schedulePickup(shipmentIds);
  }

  /**
   * Track shipment by shipment ID
   */
  async trackShipment(shipmentId: number): Promise<TrackingResponse> {
    return this.shiprocketService.trackShipment(shipmentId);
  }

  /**
   * Track shipment by AWB code
   */
  async trackByAwb(awbCode: string): Promise<TrackingResponse> {
    return this.shiprocketService.trackByAwb(awbCode);
  }

  /**
   * Generate shipping label
   */
  async generateLabel(shipmentIds: number[]): Promise<LabelResponse> {
    return this.shiprocketService.generateLabel(shipmentIds);
  }

  /**
   * Generate manifest
   */
  async generateManifest(shipmentIds: number[]): Promise<ManifestResponse> {
    return this.shiprocketService.generateManifest(shipmentIds);
  }

  /**
   * Check pincode serviceability
   */
  async checkPincodeServiceability(
    params: PincodeServiceabilityParams
  ): Promise<ServiceabilityResponse> {
    return this.shiprocketService.checkPincodeServiceability(params);
  }

  /**
   * Create return order
   */
  async createReturnOrder(
    data: CreateReturnOrderDTO
  ): Promise<ReturnOrderResponse> {
    return this.shiprocketService.createReturnOrder(data);
  }
}
