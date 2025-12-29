import { injectable, inject } from "tsyringe";
import { IShipmentRepository } from "../../infrastructure/interface/Ishipmentrepository.js";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";

import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums.js";
import { IShiprocketRepository } from "../../infrastructure/interface/IshiprocketRepository.js";
import { EmailService } from "@/modules/notification/application/service/email.service.js";

@injectable()
export class ShipmentService {
  constructor(
    @inject("IShipmentRepository")
    private shipmentRepository: IShipmentRepository,
    @inject("IOrderRepository") private orderRepository: IOrderRepository,
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
        case PaymentMethod.NET_BANKING:
          return "Prepaid";
        default:
          return "Prepaid";
      }
    }

    return "Prepaid";
  }

  /**
   * Create shipment for order in Shiprocket
   */
  async createShipment(orderId: string) {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    const existingShipment = await this.shipmentRepository.findByOrderId(
      order.id
    );
    if (existingShipment) {
      throw new Error("Shipment already exists for this order");
    }

    const paymentMethod = this.determinePaymentMethod(order);

    const orderData = {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt.toISOString(),
      billingCustomerName: order.billingAddress.fullName,
      billingAddress: order.billingAddress.addressLine1,
      billingAddress2: order.billingAddress.addressLine2 || undefined,
      billingCity: order.billingAddress.city,
      billingPincode: order.billingAddress.pincode,
      billingState: order.billingAddress.state,
      billingCountry: order.billingAddress.country,
      billingEmail: order.user.email,
      billingPhone: order.billingAddress.phone,
      shippingIsBilling:
        order.shippingAddressId === order.billingAddressId ? true : false,
      shippingCustomerName: order.shippingAddress.fullName,
      shippingAddress: order.shippingAddress.addressLine1,
      shippingAddress2: order.shippingAddress.addressLine2 || undefined,
      shippingCity: order.shippingAddress.city,
      shippingPincode: order.shippingAddress.pincode,
      shippingState: order.shippingAddress.state,
      shippingCountry: order.shippingAddress.country,
      shippingEmail: order.user.email,
      shippingPhone: order.shippingAddress.phone,
      orderItems: order.items.map((item) => ({
        name: item.product.name,
        sku: item.product.sku,
        units: item.quantity,
        sellingPrice: Number(item.price),
        discount: 0,
        tax: 0,
        hsn: item.product.hsnCode ? parseInt(item.product.hsnCode) : undefined,
      })),
      paymentMethod: paymentMethod,
      subTotal: Number(order.subtotal),
      length: 30,
      breadth: 20,
      height: 10,
      weight: 0.5,
    };

    const shiprocketOrder = await this.shiprocketRepository.createOrder(
      orderData
    );

    const shipment = await this.shipmentRepository.create({
      orderId: order.id,
      shiprocketOrderId: shiprocketOrder.order_id?.toString(),
      trackingNumber: shiprocketOrder.shipment_id?.toString(),
    });

    console.log(
      `✅ Shipment created in Shiprocket: Order ${order.orderNumber} (${paymentMethod})`
    );

    return {
      shipment,
      shiprocketResponse: shiprocketOrder,
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

    const pickupPostcode = process.env.WAREHOUSE_PINCODE || "110001";
    const weight = 0.5;

    const paymentMethod = this.determinePaymentMethod(order);
    const cod = paymentMethod === "COD" ? Number(order.total) : undefined;

    const couriers = await this.shiprocketRepository.getAvailableCouriers({
      pickupPostcode,
      deliveryPostcode: order.shippingAddress.pincode,
      weight,
      cod,
    });

    return couriers;
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

    if (!shipment || !shipment.shiprocketOrderId) {
      throw new Error(
        "Shipment not found. Please create shipment first in Shiprocket."
      );
    }

    const awbResponse = await this.shiprocketRepository.assignCourier({
      shipmentId: parseInt(shipment.shiprocketOrderId),
      courierId: courierId,
    });

    const updatedShipment = await this.shipmentRepository.update(shipment.id, {
      trackingNumber: awbResponse.response.data.awb_code,
      courierName: awbResponse.response.data.courier_name,
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

    if (!shipment || !shipment.shiprocketOrderId) {
      throw new Error("Shipment not found");
    }

    const labelResponse = await this.shiprocketRepository.generateLabel([
      parseInt(shipment.shiprocketOrderId),
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

    if (!shipment || !shipment.shiprocketOrderId) {
      throw new Error("Shipment not found");
    }

    const manifestResponse = await this.shiprocketRepository.generateManifest([
      parseInt(shipment.shiprocketOrderId),
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
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    return this.shiprocketRepository.getOrderDetails(order.orderNumber);
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
