import axios, { AxiosInstance } from "axios";
import { injectable } from "tsyringe";

interface ShiprocketAuth {
  token: string;
  expiresAt: number;
}

@injectable()
export class ShiprocketService {
  private api: AxiosInstance;
  private auth: ShiprocketAuth | null = null;

  constructor() {
    this.api = axios.create({
      baseURL:
        process.env.SHIPROCKET_API_URL ||
        "https://apiv2.shiprocket.in/v1/external",
    });

    // Add interceptor for authentication
    this.api.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  /**
   * Get authentication token
   */
  private async getToken(): Promise<string> {
    // Return cached token if still valid
    if (this.auth && this.auth.expiresAt > Date.now()) {
      return this.auth.token;
    }

    try {
      const response = await axios.post(
        `${
          process.env.SHIPROCKET_API_URL ||
          "https://apiv2.shiprocket.in/v1/external"
        }/auth/login`,
        {
          email: process.env.SHIPROCKET_EMAIL,
          password: process.env.SHIPROCKET_PASSWORD,
        }
      );

      this.auth = {
        token: response.data.token,
        expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000, // 9 days
      };

      return this.auth.token;
    } catch (error) {
      console.error("Shiprocket authentication failed:", error);
      throw new Error("Failed to authenticate with Shiprocket");
    }
  }

  /**
   * Create order in Shiprocket
   */
  async createOrder(data: {
    orderNumber: string;
    orderDate: string;
    billingCustomerName: string;
    billingAddress: string;
    billingAddress2?: string;
    billingCity: string;
    billingPincode: string;
    billingState: string;
    billingCountry: string;
    billingEmail: string;
    billingPhone: string;
    shippingIsBilling: boolean;
    shippingCustomerName?: string;
    shippingAddress?: string;
    shippingAddress2?: string;
    shippingCity?: string;
    shippingPincode?: string;
    shippingState?: string;
    shippingCountry?: string;
    shippingEmail?: string;
    shippingPhone?: string;
    orderItems: Array<{
      name: string;
      sku: string;
      units: number;
      sellingPrice: number;
      discount?: number;
      tax?: number;
      hsn?: number;
    }>;
    paymentMethod: string;
    subTotal: number;
    length: number;
    breadth: number;
    height: number;
    weight: number;
  }) {
    try {
      const response = await this.api.post("/orders/create/adhoc", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "Shiprocket order creation failed:",
        error.response?.data || error
      );
      throw new Error("Failed to create Shiprocket order");
    }
  }

  /**
   * Generate AWB (Air Waybill) for shipment
   */
  async generateAwb(params: { shipmentId: number; courierId: number }) {
    try {
      const response = await this.api.post("/courier/assign/awb", params);
      return response.data;
    } catch (error: any) {
      console.error("AWB generation failed:", error.response?.data || error);
      throw new Error("Failed to generate AWB");
    }
  }

  /**
   * Get available couriers for shipment
   */
  async getAvailableCouriers(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    weight: number;
    cod?: number;
  }) {
    try {
      const response = await this.api.get("/courier/serviceability", {
        params: {
          pickup_postcode: params.pickupPostcode,
          delivery_postcode: params.deliveryPostcode,
          weight: params.weight,
          cod: params.cod || 0,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error("Failed to fetch couriers:", error.response?.data || error);
      throw new Error("Failed to fetch available couriers");
    }
  }

  /**
   * Schedule pickup
   */
  async schedulePickup(shipmentIds: number[]) {
    try {
      const response = await this.api.post("/courier/generate/pickup", {
        shipment_id: shipmentIds,
      });
      return response.data;
    } catch (error: any) {
      console.error("Pickup scheduling failed:", error.response?.data || error);
      throw new Error("Failed to schedule pickup");
    }
  }

  /**
   * Track shipment
   */
  async trackShipment(shipmentId: number) {
    try {
      const response = await this.api.get(
        `/courier/track/shipment/${shipmentId}`
      );
      return response.data;
    } catch (error: any) {
      console.error("Shipment tracking failed:", error.response?.data || error);
      throw new Error("Failed to track shipment");
    }
  }

  /**
   * Track by AWB number
   */
  async trackByAwb(awbCode: string) {
    try {
      const response = await this.api.get(`/courier/track/awb/${awbCode}`);
      return response.data;
    } catch (error: any) {
      console.error("AWB tracking failed:", error.response?.data || error);
      throw new Error("Failed to track AWB");
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(orderIds: number[]) {
    try {
      const response = await this.api.post("/orders/cancel", {
        ids: orderIds,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "Shipment cancellation failed:",
        error.response?.data || error
      );
      throw new Error("Failed to cancel shipment");
    }
  }

  /**
   * Generate label
   */
  async generateLabel(shipmentIds: number[]) {
    try {
      const response = await this.api.post("/courier/generate/label", {
        shipment_id: shipmentIds,
      });
      return response.data;
    } catch (error: any) {
      console.error("Label generation failed:", error.response?.data || error);
      throw new Error("Failed to generate label");
    }
  }

  /**
   * Generate manifest
   */
  async generateManifest(shipmentIds: number[]) {
    try {
      const response = await this.api.post("/manifests/generate", {
        shipment_id: shipmentIds,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "Manifest generation failed:",
        error.response?.data || error
      );
      throw new Error("Failed to generate manifest");
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string) {
    try {
      const response = await this.api.get(`/orders/show/${orderId}`);
      return response.data;
    } catch (error: any) {
      console.error("Failed to fetch order:", error.response?.data || error);
      throw new Error("Failed to fetch order details");
    }
  }

  /**
   * Check pincode serviceability
   */
  async checkPincodeServiceability(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    cod?: number;
    weight?: number;
  }) {
    try {
      const response = await this.api.get("/courier/serviceability", {
        params: {
          pickup_postcode: params.pickupPostcode,
          delivery_postcode: params.deliveryPostcode,
          cod: params.cod || 0,
          weight: params.weight || 1,
        },
      });

      return {
        serviceable: response.data.data.available_courier_companies.length > 0,
        couriers: response.data.data.available_courier_companies,
      };
    } catch (error: any) {
      console.error("Pincode check failed:", error.response?.data || error);
      return { serviceable: false, couriers: [] };
    }
  }

  /**
   * Return order
   */
  async createReturnOrder(data: {
    orderId: string;
    orderDate: string;
    channelId: string;
    pickupCustomerName: string;
    pickupAddress: string;
    pickupCity: string;
    pickupPincode: string;
    pickupState: string;
    pickupCountry: string;
    pickupEmail: string;
    pickupPhone: string;
    shippingCustomerName: string;
    shippingAddress: string;
    shippingCity: string;
    shippingPincode: string;
    shippingState: string;
    shippingCountry: string;
    shippingEmail: string;
    shippingPhone: string;
    orderItems: Array<{
      name: string;
      sku: string;
      units: number;
      sellingPrice: number;
    }>;
  }) {
    try {
      const response = await this.api.post("/orders/create/return", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "Return order creation failed:",
        error.response?.data || error
      );
      throw new Error("Failed to create return order");
    }
  }
}
