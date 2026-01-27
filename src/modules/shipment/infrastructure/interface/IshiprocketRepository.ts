/**
 * Shiprocket Repository Interface
 * Defines all operations for Shiprocket API integration
 */
export interface IShiprocketRepository {
  // Order Management
  createOrder(data: CreateShiprocketOrderDTO): Promise<ShiprocketOrderResponse>;
  getOrderDetails(orderId: string): Promise<ShiprocketOrderDetailsResponse>;
  cancelOrder(orderIds: number[]): Promise<ShiprocketCancelResponse>;

  // Courier Management
  getAvailableCouriers(
    params: CourierServiceabilityParams
  ): Promise<AvailableCouriersResponse>;
  assignCourier(params: AssignCourierParams): Promise<AWBResponse>;

  // Pickup Management
  schedulePickup(shipmentIds: number[]): Promise<PickupResponse>;

  // Tracking
  trackShipment(shipmentId: number): Promise<TrackingResponse>;
  trackByAwb(awbCode: string): Promise<TrackingResponse>;

  // Label & Manifest
  generateLabel(shipmentIds: number[]): Promise<LabelResponse>;
  generateManifest(shipmentIds: number[]): Promise<ManifestResponse>;

  // Serviceability
  checkPincodeServiceability(
    params: PincodeServiceabilityParams
  ): Promise<ServiceabilityResponse>;

  // Returns
  createReturnOrder(data: CreateReturnOrderDTO): Promise<ReturnOrderResponse>;
}

// ===== DTOs =====

export interface CreateShiprocketOrderDTO {
  order_id: string;
  order_date: string;

  pickup_location: string;

  billing_customer_name: string;
  billing_last_name: string;

  billing_address: string;
  billing_address_2?: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;

  shipping_is_billing: boolean;

  shipping_customer_name?: string;
  shipping_last_name?: string;

  shipping_address?: string;
  shipping_address_2?: string;
  shipping_city?: string;
  shipping_pincode?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_email?: string;
  shipping_phone?: string;

  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: number;
    discount?: number;
    tax?: number;
    hsn?: string; // ✅ keep string because Shiprocket accepts it as text also
  }>;

  payment_method: "Prepaid" | "COD";
  sub_total: number;

  length: number;
  breadth: number;
  height: number;
  weight: number;
}


export interface CourierServiceabilityParams {
  pickupPostcode: string;
  deliveryPostcode: string;
  weight: number;
  cod?: number;
}

export interface AssignCourierParams {
  shipmentId: number;
  courierId: number;
}

export interface PincodeServiceabilityParams {
  pickupPostcode: string;
  deliveryPostcode: string;
  cod?: number;
  weight?: number;
}

export interface CreateReturnOrderDTO {
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
}

// ===== Response Types =====

export interface ShiprocketOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
  onboarding_completed_now: number;
  awb_code: string | null;
  courier_company_id: number | null;
  courier_name: string | null;
}

export interface ShiprocketOrderDetailsResponse {
  data: {
    id: number;
    channel_order_id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    status: string;
    shipments: Array<{
      id: number;
      awb: string;
      courier: string;
      status: string;
    }>;
  };
}

export interface ShiprocketCancelResponse {
  message: string;
  ids: number[];
}

export interface AvailableCouriersResponse {
  data: {
    shiprocket_recommended_courier_id: any;
    available_courier_companies: Array<{
      id: number;
      courier_company_id: number;
      courier_name: string;
      freight_charge: number;
      estimated_delivery_days: string;
      rating: number;
      cod: number;
      is_surface: boolean;
    }>;
  };
}

export interface AWBResponse {
  response: {
    data: {
      awb_code: string;
      courier_name: string;
      courier_company_id: number;
    };
  };
}

export interface PickupResponse {
  pickup_status: number;
  response: {
    pickup_scheduled_date: string;
    pickup_token_number: string;
  };
}

export interface TrackingResponse {
  tracking_data: {
    track_status: number;
    shipment_status: string;
    shipment_track: Array<{
      id: number;
      awb_code: string;
      courier_company_id: number;
      shipment_id: number;
      order_id: number;
      pickup_date: string;
      delivered_date: string | null;
      weight: string;
      packages: number;
      current_status: string;
      delivered_to: string | null;
      destination: string;
      consignee_name: string;
      origin: string;
      courier_agent_details: string | null;
      edd: string | null;
    }>;
    shipment_track_activities: Array<{
      date: string;
      status: string;
      activity: string;
      location: string;
      sr_status: string;
      sr_status_label: string;
    }>;
  };
}

export interface LabelResponse {
  label_url: string;
  label_created: number;
}

export interface ManifestResponse {
  manifest_url: string;
  status: number;
}

export interface ServiceabilityResponse {
  serviceable: boolean;
  couriers: Array<{
    id: number;
    courier_company_id: number;
    courier_name: string;
    freight_charge: number;
    estimated_delivery_days: string;
    rating: number;
  }>;
}

export interface ReturnOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
}
