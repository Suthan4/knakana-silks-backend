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

    this.api.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  private async getToken(): Promise<string> {
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
        expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000,
      };

      return this.auth.token;
    } catch (error) {
      console.error("Shiprocket authentication failed:", error);
      throw new Error("Failed to authenticate with Shiprocket");
    }
  }

  async createOrder(data: any) {
    try {
      const response = await this.api.post("/orders/create/adhoc", data);
      return response.data;
    } catch (error: any) {
      console.error("Shiprocket order creation failed:", error.response?.data || error);
      throw new Error("Failed to create Shiprocket order");
    }
  }

  async generateAwb(params: { shipmentId: number; courierId: number }) {
    try {
      const response = await this.api.post("/courier/assign/awb", params);
      return response.data;
    } catch (error: any) {
      console.error("AWB generation failed:", error.response?.data || error);
      throw new Error("Failed to generate AWB");
    }
  }

  async getAvailableCouriers(params: any) {
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

  async trackShipment(shipmentId: number) {
    try {
      const response = await this.api.get(`/courier/track/shipment/${shipmentId}`);
      return response.data;
    } catch (error: any) {
      console.error("Shipment tracking failed:", error.response?.data || error);
      throw new Error("Failed to track shipment");
    }
  }

  async trackByAwb(awbCode: string) {
    try {
      const response = await this.api.get(`/courier/track/awb/${awbCode}`);
      return response.data;
    } catch (error: any) {
      console.error("AWB tracking failed:", error.response?.data || error);
      throw new Error("Failed to track AWB");
    }
  }

  async cancelShipment(orderIds: number[]) {
    try {
      const response = await this.api.post("/orders/cancel", {
        ids: orderIds,
      });
      return response.data;
    } catch (error: any) {
      console.error("Shipment cancellation failed:", error.response?.data || error);
      throw new Error("Failed to cancel shipment");
    }
  }

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

  async generateManifest(shipmentIds: number[]) {
    try {
      const response = await this.api.post("/manifests/generate", {
        shipment_id: shipmentIds,
      });
      return response.data;
    } catch (error: any) {
      console.error("Manifest generation failed:", error.response?.data || error);
      throw new Error("Failed to generate manifest");
    }
  }

  async getOrderDetails(orderId: string) {
    try {
      const response = await this.api.get(`/orders/show/${orderId}`);
      return response.data;
    } catch (error: any) {
      console.error("Failed to fetch order:", error.response?.data || error);
      throw new Error("Failed to fetch order details");
    }
  }

  async checkPincodeServiceability(params: any) {
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

  async createReturnOrder(data: any) {
    try {
      const response = await this.api.post("/orders/create/return", data);
      return response.data;
    } catch (error: any) {
      console.error("Return order creation failed:", error.response?.data || error);
      throw new Error("Failed to create return order");
    }
  }
}
