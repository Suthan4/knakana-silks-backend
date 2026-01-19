import { z } from "zod";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums.js";

// ===== CREATE ORDER DTO =====
export const CreateOrderDTOSchema = z.object({
  shippingAddressId: z.string().min(1, "Shipping address is required"),
  billingAddressId: z.string().min(1, "Billing address is required"),
  couponCode: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  items: z
  .array(
    z.object({
      productId: z.string(),
      variantId: z.string().optional(),
      quantity: z.number().min(1),
    })
  )
  .optional(),
});

export type CreateOrderDTO = z.infer<typeof CreateOrderDTOSchema>;

// ===== UPDATE ORDER STATUS DTO =====
export const UpdateOrderStatusDTOSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export type UpdateOrderStatusDTO = z.infer<typeof UpdateOrderStatusDTOSchema>;

// ===== CANCEL ORDER DTO =====
export const CancelOrderDTOSchema = z.object({
  reason: z.string().optional(),
});

export type CancelOrderDTO = z.infer<typeof CancelOrderDTOSchema>;

// ===== QUERY ORDER DTO =====
export const QueryOrderDTOSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: z.nativeEnum(OrderStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["createdAt", "total", "orderNumber"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryOrderDTO = z.infer<typeof QueryOrderDTOSchema>;

// ===== RAZORPAY VERIFICATION DTO =====
export const VerifyPaymentDTOSchema = z.object({
  razorpay_order_id: z.string().min(1, "Razorpay order ID is required"),
  razorpay_payment_id: z.string().min(1, "Razorpay payment ID is required"),
  razorpay_signature: z.string().min(1, "Razorpay signature is required"),
});

export type VerifyPaymentDTO = z.infer<typeof VerifyPaymentDTOSchema>;