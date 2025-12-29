import { z } from "zod";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums.js";

// Create Order DTO
export const CreateOrderDTOSchema = z.object({
  shippingAddressId: z.string(),
  billingAddressId: z.string(),
  couponCode: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
});

export type CreateOrderDTO = z.infer<typeof CreateOrderDTOSchema>;

// Update Order Status DTO
export const UpdateOrderStatusDTOSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export type UpdateOrderStatusDTO = z.infer<typeof UpdateOrderStatusDTOSchema>;

// Query Order DTO
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

// Razorpay Verification DTO
export const VerifyPaymentDTOSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export type VerifyPaymentDTO = z.infer<typeof VerifyPaymentDTOSchema>;
