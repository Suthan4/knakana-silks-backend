// src/modules/shipping/application/service/shipping-calculator.service.ts
import { injectable, inject } from "tsyringe";
import { IShiprocketRepository } from "@/modules/shipment/infrastructure/interface/IshiprocketRepository.js";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";
import { ICartRepository } from "@/modules/cart/infrastructure/interface/Icartrepository.js";

interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

interface ShippingCalculation {
  subtotal: number;
  totalWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  shippingCost: number;
  isFreeShipping: boolean;
  freeShippingThreshold: number;
  amountNeededForFreeShipping?: number;
  serviceable: boolean;
  estimatedDelivery: string;
  availableCouriers: any[];
  cheapestCourier?: any;
  fastestCourier?: any;
  message?: string;
}

@injectable()
export class ShippingCalculatorService {
  // Free shipping threshold (configurable)
  private readonly FREE_SHIPPING_THRESHOLD = 1000;

  constructor(
    @inject("IShiprocketRepository")
    private shiprocketRepository: IShiprocketRepository,
    @inject("IWarehouseRepository")
    private warehouseRepository: IWarehouseRepository,
    @inject("IProductRepository")
    private productRepository: IProductRepository,
    @inject("ICartRepository")
    private cartRepository: ICartRepository
  ) {}

  /**
   * Calculate volumetric weight: (L × B × H) / 5000
   */
  private calculateVolumetricWeight(
    length: number,
    breadth: number,
    height: number
  ): number {
    return (length * breadth * height) / 5000;
  }

  /**
   * Get chargeable weight (higher of actual or volumetric)
   */
  private getChargeableWeight(
    actualWeight: number,
    volumetricWeight: number
  ): number {
    return Math.max(actualWeight, volumetricWeight);
  }

  /**
   * Get default pickup warehouse
   */
  private async getPickupWarehouse() {
    const warehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isDefaultPickup: true, isActive: true },
    });

    if (warehouses.length > 0) {
      return warehouses[0];
    }

    const fallbackWarehouses = await this.warehouseRepository.findAll({
      skip: 0,
      take: 1,
      where: { isActive: true },
    });

    if (fallbackWarehouses.length === 0) {
      throw new Error("No active warehouse found");
    }

    return fallbackWarehouses[0];
  }

  /**
   * Calculate shipping for user's cart
   */
  async calculateCartShipping(
    userId: string,
    deliveryPincode: string,
    cartItems?: CartItem[]
  ): Promise<ShippingCalculation> {
    try {
      // Get pickup warehouse
      const pickupWarehouse = await this.getPickupWarehouse();

      let items: any[] = [];
      let subtotal = 0;

      // Get cart items
      if (cartItems && cartItems.length > 0) {
        // For buy now or specific items
        for (const item of cartItems) {
          const product = await this.productRepository.findById(
            BigInt(item.productId)
          );
          if (!product) continue;

          const variant = item.variantId
            ? await this.productRepository.findVariantById(
                BigInt(item.variantId)
              )
            : null;

          const price = variant
            ? Number(variant.sellingPrice || variant.price)
            : Number(product.sellingPrice);

          items.push({
            product,
            variant,
            quantity: item.quantity,
            price,
          });

          subtotal += price * item.quantity;
        }
      } else {
        // Get from user's cart
        const cart = await this.cartRepository.getCartWithItems(
          BigInt(userId)
        );
        if (!cart || cart.items.length === 0) {
          throw new Error("Cart is empty");
        }

        items = cart.items.map((item) => {
          const price = item.variant
            ? Number(item.variant.sellingPrice || item.variant.price)
            : Number(item.product.sellingPrice);

          subtotal += price * item.quantity;

          return {
            product: item.product,
            variant: item.variant,
            quantity: item.quantity,
            price,
          };
        });
      }

      // Calculate total weight and dimensions
      let totalWeight = 0;
      let maxLength = 0;
      let maxBreadth = 0;
      let totalHeight = 0;

      for (const item of items) {
        const product = item.product;
        const variant = item.variant;
        const quantity = item.quantity;

        // Use variant dimensions if available, else product dimensions
        const weight =
          variant?.weight || product.weight
            ? Number(variant?.weight || product.weight)
            : 0.5;
        const length =
          variant?.length || product.length
            ? Number(variant?.length || product.length)
            : 35;
        const breadth =
          variant?.breadth || product.breadth
            ? Number(variant?.breadth || product.breadth)
            : 25;
        const height =
          variant?.height || product.height
            ? Number(variant?.height || product.height)
            : 5;

        totalWeight += weight * quantity;
        maxLength = Math.max(maxLength, length);
        maxBreadth = Math.max(maxBreadth, breadth);
        totalHeight += height * quantity;
      }

      const volumetricWeight = this.calculateVolumetricWeight(
        maxLength,
        maxBreadth,
        totalHeight
      );
      const chargeableWeight = this.getChargeableWeight(
        totalWeight,
        volumetricWeight
      );

      // Check if free shipping applies
      const isFreeShipping = subtotal >= this.FREE_SHIPPING_THRESHOLD;
      const amountNeededForFreeShipping = isFreeShipping
        ? undefined
        : this.FREE_SHIPPING_THRESHOLD - subtotal;

      // Get available couriers from Shiprocket
      let availableCouriers: any[] = [];
      let shippingCost = 0;
      let estimatedDelivery = "3-5 days";
      let serviceable = false;

      try {
        const courierResponse =
          await this.shiprocketRepository.getAvailableCouriers({
            pickupPostcode: pickupWarehouse.pincode,
            deliveryPostcode: deliveryPincode,
            weight: chargeableWeight,
            cod: 0, // Assume prepaid for shipping calculation
          });

        const couriers =
          courierResponse.data?.available_courier_companies || [];
        availableCouriers = couriers;

        if (couriers.length > 0) {
          serviceable = true;

          // Find cheapest and fastest couriers
          const sortedByCost = [...couriers].sort(
            (a, b) => a.freight_charge - b.freight_charge
          );
          const sortedBySpeed = [...couriers].sort((a, b) => {
            const daysA = parseInt(a.estimated_delivery_days) || 999;
            const daysB = parseInt(b.estimated_delivery_days) || 999;
            return daysA - daysB;
          });

          const cheapestCourier = sortedByCost[0];
          const fastestCourier = sortedBySpeed[0];

          // Use cheapest courier for shipping cost
          shippingCost = isFreeShipping ? 0 : cheapestCourier.freight_charge;
          estimatedDelivery = cheapestCourier.estimated_delivery_days
            ? `${cheapestCourier.estimated_delivery_days} days`
            : "3-5 days";

          return {
            subtotal,
            totalWeight,
            volumetricWeight,
            chargeableWeight,
            shippingCost,
            isFreeShipping,
            freeShippingThreshold: this.FREE_SHIPPING_THRESHOLD,
            amountNeededForFreeShipping,
            serviceable,
            estimatedDelivery,
            availableCouriers: couriers,
            cheapestCourier,
            fastestCourier,
          };
        } else {
          serviceable = false;
          return {
            subtotal,
            totalWeight,
            volumetricWeight,
            chargeableWeight,
            shippingCost: 0,
            isFreeShipping: false,
            freeShippingThreshold: this.FREE_SHIPPING_THRESHOLD,
            serviceable: false,
            estimatedDelivery: "Not available",
            availableCouriers: [],
            message: `Delivery not available to pincode ${deliveryPincode}`,
          };
        }
      } catch (error) {
        console.error("Shiprocket API error:", error);

        // Fallback to default shipping
        return {
          subtotal,
          totalWeight,
          volumetricWeight,
          chargeableWeight,
          shippingCost: isFreeShipping ? 0 : 50, // Default ₹50 shipping
          isFreeShipping,
          freeShippingThreshold: this.FREE_SHIPPING_THRESHOLD,
          amountNeededForFreeShipping,
          serviceable: true, // Assume serviceable in fallback
          estimatedDelivery: "3-5 days",
          availableCouriers: [],
          message: "Using standard shipping rates",
        };
      }
    } catch (error: any) {
      console.error("Shipping calculation error:", error);
      throw new Error(error.message || "Failed to calculate shipping");
    }
  }

  /**
   * Check pincode serviceability (public)
   */
  async checkPincodeServiceability(
    pickupPincode: string,
    deliveryPincode: string
  ) {
    try {
      const result =
        await this.shiprocketRepository.checkPincodeServiceability({
          pickupPostcode: pickupPincode,
          deliveryPostcode: deliveryPincode,
        });

      return {
        serviceable: result.serviceable,
        couriers: result.couriers || [],
        message: result.serviceable
          ? "Delivery available"
          : "Delivery not available to this pincode",
      };
    } catch (error) {
      console.error("Serviceability check error:", error);
      return {
        serviceable: false,
        couriers: [],
        message: "Unable to check serviceability",
      };
    }
  }

  async getShippingRatesByPincode(params: {
  deliveryPincode: string;
  cod?: boolean;
  weight?: number;
}) {
  const pickupWarehouse = await this.getPickupWarehouse();

  const courierResponse = await this.shiprocketRepository.getAvailableCouriers({
    pickupPostcode: pickupWarehouse.pincode,
    deliveryPostcode: params.deliveryPincode,
    weight: params.weight ?? 0.5,
    cod: params.cod ? 1 : 0,
  });

  const couriers = courierResponse.data?.available_courier_companies || [];

  const sortedByCost = [...couriers].sort(
    (a, b) => a.freight_charge - b.freight_charge
  );

  const sortedBySpeed = [...couriers].sort((a, b) => {
    const daysA = parseInt(a.estimated_delivery_days) || 999;
    const daysB = parseInt(b.estimated_delivery_days) || 999;
    return daysA - daysB;
  });

  return {
    available_courier_companies: couriers,
    shiprocket_recommended_courier_id:
      courierResponse.data?.shiprocket_recommended_courier_id,
    cheapest_courier: sortedByCost[0] || null,
    fastest_courier: sortedBySpeed[0] || null,
  };
}

}