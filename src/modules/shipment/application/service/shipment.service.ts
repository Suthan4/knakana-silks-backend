import { IShipmentRepository } from "../../infrastructure/interface/Ishipmentrepository.js";
import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";

import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums.js";
import { IShiprocketRepository } from "../../infrastructure/interface/IshiprocketRepository.js";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";

@injectable()
export class ShipmentService {
  constructor(
    @inject("IShipmentRepository")
    private shipmentRepository: IShipmentRepository,
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
    @inject("IWarehouseRepository")
    private warehouseRepository: IWarehouseRepository,
    @inject("IShiprocketRepository")
    private shiprocketRepository: IShiprocketRepository,
    @inject(EmailService) private emailService: EmailService
  ) {}

  /**
   * Determine if order is COD or Prepaid
   */
  private determinePaymentMethod(order: any): "COD" | "Prepaid" {
    if (
      order.payment?.status === "SUCCESS" ||
      order.payment?.status === "COMPLETED"
    ) {
      return "Prepaid";
    }

    if (order.payment?.status === "PENDING") {
      return "COD";
    }

    if (order.payment?.method) {
      switch (order.payment.method) {
        case PaymentMethod.CARD:
        case PaymentMethod.UPI:
        case PaymentMethod.WALLET:
        case PaymentMethod.NETBANKING:
          return "Prepaid";
        default:
          return "Prepaid";
      }
    }

    return "Prepaid";
  }

  /**
   * 🆕 Calculate volumetric weight: (L × B × H) / 5000
   */
  private calculateVolumetricWeight(
    length: number,
    breadth: number,
    height: number
  ): number {
    return (length * breadth * height) / 5000;
  }

  /**
   * 🆕 Get chargeable weight (higher of actual or volumetric)
   */
  private getChargeableWeight(
    actualWeight: number,
    length: number,
    breadth: number,
    height: number
  ): number {
    const volumetricWeight = this.calculateVolumetricWeight(
      length,
      breadth,
      height
    );
    return Math.max(actualWeight, volumetricWeight);
  }

  /**
   * 🆕 Calculate total weight and dimensions for order
   */
  private calculateOrderDimensions(order: any): {
    totalWeight: number;
    length: number;
    breadth: number;
    height: number;
    chargeableWeight: number;
  } {
    let totalWeight = 0;
    let maxLength = 0;
    let maxBreadth = 0;
    let totalHeight = 0;

    for (const item of order.items) {
      const product = item.product;
      const quantity = item.quantity;

      // Use product dimensions or defaults
      const weight = product.weight ? Number(product.weight) : 0.5;
      const length = product.length ? Number(product.length) : 35;
      const breadth = product.breadth ? Number(product.breadth) : 25;
      const height = product.height ? Number(product.height) : 5;

      totalWeight += weight * quantity;
      maxLength = Math.max(maxLength, length);
      maxBreadth = Math.max(maxBreadth, breadth);
      totalHeight += height * quantity; // Stack items
    }

    const chargeableWeight = this.getChargeableWeight(
      totalWeight,
      maxLength,
      maxBreadth,
      totalHeight
    );

    return {
      totalWeight,
      length: maxLength,
      breadth: maxBreadth,
      height: totalHeight,
      chargeableWeight,
    };
  }

  /**
   * 🆕 Get default pickup warehouse
   */
  private async getPickupWarehouse() {
    // First try to get default pickup warehouse
    const warehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isDefaultPickup: true, isActive: true },
    });

    if (warehouses.length > 0) {
      return warehouses[0];
    }

    // Fallback to any active warehouse
    const fallbackWarehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isActive: true },
    });

    if (fallbackWarehouses.length === 0) {
      throw new Error(
        "No active warehouse found. Please configure a warehouse first."
      );
    }

    return fallbackWarehouses[0];
  }

  /**
   * Create shipment for order in Shiprocket
   */
  async createShipment(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }
console.log("order",order);

    const existingShipment = await this.shipmentRepository.findByOrderId(
      order.id
    );
    if (existingShipment) {
      throw new Error("Shipment already exists for this order");
    }

    const paymentMethod = this.determinePaymentMethod(order);

    // 🆕 Get pickup warehouse
    const pickupWarehouse = await this.getPickupWarehouse();

    // 🆕 Calculate order dimensions
    const dimensions = this.calculateOrderDimensions(order);

    console.log(`📦 Order Dimensions:`, {
      totalWeight: dimensions.totalWeight,
      chargeableWeight: dimensions.chargeableWeight,
      length: dimensions.length,
      breadth: dimensions.breadth,
      height: dimensions.height,
    });

      const shiprocketPayload = {
          order_id: order.orderNumber, // ✅ string/number
          order_date: order.createdAt.toISOString(), // ✅ required

          pickup_location: pickupWarehouse.name, // ✅ should match warehouse pickup name in Shiprocket

          billing_customer_name: order.billingAddress.fullName,
          billing_last_name: ".", // ✅ REQUIRED by Shiprocket (give something if you don’t have last name)

          billing_address: order.billingAddress.addressLine1,
          billing_address_2: order.billingAddress.addressLine2 || "",
          billing_city: order.billingAddress.city,
          billing_pincode: order.billingAddress.pincode,
          billing_state: order.billingAddress.state,
          billing_country: order.billingAddress.country || "India",
          billing_email: order.user.email,
          billing_phone: order.billingAddress.phone,

          shipping_is_billing: order.shippingAddressId === order.billingAddressId,

          shipping_customer_name: order.shippingAddress.fullName,
          shipping_last_name: ".", // ✅ REQUIRED (same rule)
          shipping_address: order.shippingAddress.addressLine1,
          shipping_address_2: order.shippingAddress.addressLine2 || "",
          shipping_city: order.shippingAddress.city,
          shipping_pincode: order.shippingAddress.pincode,
          shipping_state: order.shippingAddress.state,
          shipping_country: order.shippingAddress.country || "India",
          shipping_email: order.user.email,
          shipping_phone: order.shippingAddress.phone,

          order_items: order.items.map((item) => ({
            name: item.product.name,
            sku: item.product.sku || item.product.id.toString(), // ✅ must exist
            units: item.quantity,
            selling_price: Number(item.price),
            discount: 0,
            tax: 0,
            hsn: item.product.hsnCode ? String(item.product.hsnCode) : "",
          })),

          payment_method: paymentMethod, // ✅ "Prepaid" or "COD"
          sub_total: Number(order.subtotal),

          length: Math.ceil(dimensions.length),
          breadth: Math.ceil(dimensions.breadth),
          height: Math.ceil(dimensions.height),
          weight: Number(dimensions.chargeableWeight), // ✅ in KG
  };


    const shiprocketOrder = await this.shiprocketRepository.createOrder(
      shiprocketPayload
    );

    const shipment = await this.shipmentRepository.create({
      orderId: order.id,
      shiprocketOrderId: shiprocketOrder.order_id?.toString(),
      trackingNumber: shiprocketOrder.shipment_id?.toString(),
    });

    console.log(
      `✅ Shipment created in Shiprocket: Order ${order.orderNumber} (${paymentMethod})`
    );
    console.log(`📦 Chargeable Weight: ${dimensions.chargeableWeight}kg`);
    console.log(
      `🏢 Pickup from: ${pickupWarehouse.name}, ${pickupWarehouse.city}`
    );

    return {
      shipment,
      shiprocketResponse: shiprocketOrder,
      dimensions,
      pickupWarehouse: {
        name: pickupWarehouse.name,
        address: `${pickupWarehouse.address}, ${pickupWarehouse.city}`,
      },
    };
  }

  /**
   * Get available couriers for order
   */
  async getAvailableCouriers(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    // 🆕 Get pickup warehouse
    const pickupWarehouse = await this.getPickupWarehouse();

    // 🆕 Calculate dimensions
    const dimensions = this.calculateOrderDimensions(order);

    const paymentMethod = this.determinePaymentMethod(order);
    const cod = paymentMethod === "COD" ? Number(order.total) : undefined;

    const couriers = await this.shiprocketRepository.getAvailableCouriers({
      pickupPostcode: pickupWarehouse.pincode,
      deliveryPostcode: order.shippingAddress.pincode,
      weight: dimensions.chargeableWeight,
      cod,
    });

    return {
      couriers,
      dimensions,
      pickupWarehouse: {
        name: pickupWarehouse.name,
        pincode: pickupWarehouse.pincode,
      },
    };
  }

  /**
   * Assign courier and generate AWB
   */
  async assignCourier(orderId: string, courierId: number) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment || !shipment.shiprocketShipmentId) {
      throw new Error(
        "Shipment not found. Please create shipment first in Shiprocket."
      );
    }

    const awbResponse = await this.shiprocketRepository.assignCourier({
      shipmentId: shipment.shiprocketShipmentId,
      courierId: courierId,
    });

    const updatedShipment = await this.shipmentRepository.update(shipment.id, {
 awbCode: awbResponse.response.data.awb_code,              // ✅ ADDED
  trackingNumber: awbResponse.response.data.awb_code,       
  courierName: awbResponse.response.data.courier_name,
  courierCompanyId: awbResponse.response.data.courier_company_id,
    });

    console.log(
      `✅ AWB generated for order ${order.orderNumber}: ${awbResponse.response.data.awb_code}`
    );

    return {
      shipment: updatedShipment,
      awb: awbResponse.response.data.awb_code,
      courierName: awbResponse.response.data.courier_name,
    };
  }

  /**
   * Schedule pickup with courier
   */
  async schedulePickup(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment || !shipment.shiprocketOrderId) {
      throw new Error("Shipment not found");
    }

    if (!shipment.trackingNumber) {
      throw new Error("Please assign courier and generate AWB first");
    }

    const pickupResponse = await this.shiprocketRepository.schedulePickup([
      parseInt(shipment.shiprocketOrderId),
    ]);

    await this.shipmentRepository.update(shipment.id, {
      shippedAt: new Date(),
    });

    await this.orderRepository.update(order.id, {
      status: OrderStatus.SHIPPED,
    });

    // Send shipping notification email
    try {
      await this.emailService.sendShippingNotification({
        email: order.user.email,
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        trackingNumber: shipment.trackingNumber,
        courierName: shipment.courierName || undefined,
        estimatedDelivery: shipment.estimatedDelivery || undefined,
      });
    } catch (error) {
      console.error("Failed to send shipping email:", error);
    }

    console.log(`✅ Pickup scheduled for order ${order.orderNumber}`);

    return pickupResponse;
  }

  /**
   * Track shipment by order ID
   */
  async trackShipment(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment) {
      throw new Error("Shipment not found for this order");
    }

    if (shipment.trackingNumber) {
      return this.shiprocketRepository.trackByAwb(shipment.trackingNumber);
    } else if (shipment.shiprocketOrderId) {
      return this.shiprocketRepository.trackShipment(
        parseInt(shipment.shiprocketOrderId)
      );
    }

    throw new Error("No tracking information available");
  }

  /**
   * Track shipment by tracking number (public)
   */
  async trackByTrackingNumber(trackingNumber: string) {
    return this.shiprocketRepository.trackByAwb(trackingNumber);
  }

  /**
   * Mark order as delivered
   */
  async markAsDelivered(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment) {
      throw new Error("Shipment not found");
    }

    await this.shipmentRepository.update(shipment.id, {
      deliveredAt: new Date(),
    });

    await this.orderRepository.update(order.id, {
      status: OrderStatus.DELIVERED,
    });

    // Send delivery confirmation email
    try {
      await this.emailService.sendDeliveryConfirmation({
        email: order.user.email,
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
      });
    } catch (error) {
      console.error("Failed to send delivery email:", error);
    }

    console.log(`✅ Order ${order.orderNumber} marked as delivered`);

    return this.orderRepository.findById(order.id);
  }

  /**
   * Generate shipping label
   */
  async generateLabel(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment || !shipment.shiprocketShipmentId) {
      throw new Error("Shipment not found");
    }

    const labelResponse = await this.shiprocketRepository.generateLabel([
      parseInt(shipment.shiprocketShipmentId),
    ]);

    return labelResponse;
  }

  /**
   * Generate manifest
   */
  async generateManifest(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment || !shipment.shiprocketShipmentId) {
      throw new Error("Shipment not found");
    }

    const manifestResponse = await this.shiprocketRepository.generateManifest([
      parseInt(shipment.shiprocketShipmentId),
    ]);

    return manifestResponse;
  }

  /**
   * Check pincode serviceability (public)
   */
  async checkServiceability(pickupPincode: string, deliveryPincode: string) {
    return this.shiprocketRepository.checkPincodeServiceability({
      pickupPostcode: pickupPincode,
      deliveryPostcode: deliveryPincode,
    });
  }

  /**
   * Get shipment details by order ID
   */
  async getShipmentByOrderId(orderId: string) {
    const shipment = await this.shipmentRepository.findByOrderId(
      BigInt(orderId)
    );

    if (!shipment) {
      throw new Error("Shipment not found for this order");
    }

    return shipment;
  }

  /**
   * Get Shiprocket order details
   */
  async getShiprocketOrderDetails(orderId: string) {
    const shiprocketOrder = this.shiprocketRepository.getOrderDetails(orderId)
  if (!shiprocketOrder) {
    throw new Error("Shiprocket Order not found");
  }
  return shiprocketOrder
  }

  /**
   * Create return order
   */
  async createReturnOrder(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new Error("Only delivered orders can be returned");
    }

    const returnData = {
      orderId: order.orderNumber,
      orderDate: new Date().toISOString(),
      channelId: "custom",
      pickupCustomerName: order.shippingAddress.fullName,
      pickupAddress: order.shippingAddress.addressLine1,
      pickupCity: order.shippingAddress.city,
      pickupPincode: order.shippingAddress.pincode,
      pickupState: order.shippingAddress.state,
      pickupCountry: order.shippingAddress.country,
      pickupEmail: order.user.email,
      pickupPhone: order.shippingAddress.phone,
      shippingCustomerName: "Kangana Silks Warehouse",
      shippingAddress: order.billingAddress.addressLine1,
      shippingCity: order.billingAddress.city,
      shippingPincode: order.billingAddress.pincode,
      shippingState: order.billingAddress.state,
      shippingCountry: order.billingAddress.country,
      shippingEmail: process.env.WAREHOUSE_EMAIL || order.user.email,
      shippingPhone: order.billingAddress.phone,
      orderItems: order.items.map((item) => ({
        name: item.product.name,
        sku: item.product.sku,
        units: item.quantity,
        sellingPrice: Number(item.price),
      })),
    };

    const returnOrder = await this.shiprocketRepository.createReturnOrder(
      returnData
    );

    console.log(`✅ Return order created for ${order.orderNumber}`);

    return returnOrder;
  }

  /**
   * Cancel shipment in Shiprocket
   */
  async cancelShipment(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const shipment = await this.shipmentRepository.findByOrderId(order.id);

    if (!shipment || !shipment.shiprocketOrderId) {
      throw new Error("Shipment not found");
    }

    const cancelResponse = await this.shiprocketRepository.cancelOrder([
      parseInt(shipment.shiprocketOrderId),
    ]);

    console.log(`✅ Shipment cancelled for order ${order.orderNumber}`);

    return cancelResponse;
  }
}
