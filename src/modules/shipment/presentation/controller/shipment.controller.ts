import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ShipmentService } from "../../application/service/shipment.service.js";
import { z } from "zod";
import { ShiprocketService } from "../../infrastructure/services/shiprocket.service.js";

const CreateShipmentDTOSchema = z.object({
  orderId: z.string(),
});

const AssignCourierDTOSchema = z.object({
  orderId: z.string(),
  courierId: z.number(),
});
const GenerateAwbDTOSchema = z.object({
  shipmentId: z.string(),
  courierId: z.number(),
});

const CheckServiceabilityDTOSchema = z.object({
  pickupPincode: z.string().regex(/^[1-9][0-9]{5}$/),
  deliveryPincode: z.string().regex(/^[1-9][0-9]{5}$/),
});

@injectable()
export class ShipmentController {
  constructor(
    @inject(ShipmentService) private shipmentService: ShipmentService,
    @inject(ShiprocketService) private shiprocketService: ShiprocketService
  ) {}

  /**
   * Create shipment for order in Shiprocket (Admin)
   */
  async createShipment(req: Request, res: Response) {
    try {
      const data = CreateShipmentDTOSchema.parse(req.body);
      const result = await this.shipmentService.createShipment(data.orderId);

      res.status(201).json({
        success: true,
        message: "Shipment created successfully in Shiprocket",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get available couriers (Admin)
   */
  async getAvailableCouriers(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId || Array.isArray(orderId)) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const couriers = await this.shipmentService.getAvailableCouriers(
        orderId
      );

      res.json({
        success: true,
        message: "Available couriers fetched successfully",
        data: couriers,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Assign courier and generate AWB (Admin)
   */
  async assignCourier(req: Request, res: Response) {
    try {
      const data = AssignCourierDTOSchema.parse(req.body);
      const result = await this.shipmentService.assignCourier(
        data.orderId,
        data.courierId
      );

      res.json({
        success: true,
        message: "Courier assigned and AWB generated successfully",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }


  /**
   * Schedule pickup (Admin)
   */
  async schedulePickup(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const result = await this.shipmentService.schedulePickup(orderId);

      res.json({
        success: true,
        message: "Pickup scheduled successfully. Order marked as SHIPPED.",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Track shipment by order ID (User/Admin)
   */
  async trackShipment(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId || Array.isArray(orderId)) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const tracking = await this.shipmentService.trackShipment(orderId);

      res.json({
        success: true,
        message: "Shipment tracking information retrieved",
        data: tracking,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Track by tracking number (Public)
   */
  async trackByTrackingNumber(req: Request, res: Response) {
    try {
      const { trackingNumber } = req.params;

      if (!trackingNumber || Array.isArray(trackingNumber)) {
        res
          .status(400)
          .json({ success: false, message: "Tracking number is required" });
        return;
      }

      const tracking = await this.shipmentService.trackByTrackingNumber(
        trackingNumber
      );

      res.json({
        success: true,
        message: "Tracking information retrieved",
        data: tracking,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark as delivered (Admin)
   */
  async markAsDelivered(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const order = await this.shipmentService.markAsDelivered(orderId);

      res.json({
        success: true,
        message: "Order marked as delivered successfully",
        data: order,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Generate shipping label (Admin)
   */
  async generateLabel(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const label = await this.shipmentService.generateLabel(orderId);

      res.json({
        success: true,
        message: "Shipping label generated successfully",
        data: label,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Generate manifest (Admin)
   */
  async generateManifest(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const manifest = await this.shipmentService.generateManifest(orderId);

      res.json({
        success: true,
        message: "Manifest generated successfully",
        data: manifest,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Check pincode serviceability (Public)
   */
  async checkServiceability(req: Request, res: Response) {
    try {
      const data = CheckServiceabilityDTOSchema.parse(req.body);
      const result = await this.shipmentService.checkServiceability(
        data.pickupPincode,
        data.deliveryPincode
      );

      res.json({
        success: true,
        message: "Serviceability checked successfully",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get shipment by order ID (User/Admin)
   */
  async getShipmentByOrderId(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId || Array.isArray(orderId)) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const shipment = await this.shipmentService.getShipmentByOrderId(
        orderId
      );

      res.json({
        success: true,
        data: shipment,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Shiprocket order details (Admin)
   */
  async getShiprocketOrderDetails(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId || Array.isArray(orderId)) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const details = await this.shipmentService.getShiprocketOrderDetails(
        orderId
      );

      res.json({
        success: true,
        message: "Shiprocket order details retrieved",
        data: details,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Create return order (Admin)
   */
  async createReturnOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const returnOrder = await this.shipmentService.createReturnOrder(
        orderId
      );

      res.status(201).json({
        success: true,
        message: "Return order created successfully",
        data: returnOrder,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Cancel shipment (Admin)
   */
  async cancelShipment(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        res
          .status(400)
          .json({ success: false, message: "Order ID is required" });
        return;
      }

      const result = await this.shipmentService.cancelShipment(orderId);

      res.json({
        success: true,
        message: "Shipment cancelled successfully in Shiprocket",
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
