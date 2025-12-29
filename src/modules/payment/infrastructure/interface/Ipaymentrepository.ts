import { Payment, Prisma } from "@/generated/prisma/client.js";

export type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: {
    order: {
      include: {
        user: true;
        items: true;
      };
    };
  };
}>;

export interface IPaymentRepository {
  findById(id: bigint): Promise<PaymentWithOrder | null>;
  findByOrderId(orderId: bigint): Promise<Payment | null>;
  findByRazorpayOrderId(razorpayOrderId: string): Promise<Payment | null>;
  findByRazorpayPaymentId(razorpayPaymentId: string): Promise<Payment | null>;
  create(data: {
    orderId: bigint;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    method: any;
    status: any;
    amount: number;
    refundAmount?: number;
  }): Promise<Payment>;
  update(id: bigint, data: Partial<Payment>): Promise<Payment>;
  updateByOrderId(orderId: bigint, data: Partial<Payment>): Promise<Payment>;
}
