import { inject, injectable } from "tsyringe";
import { Payment, PrismaClient } from "@/generated/prisma/client.js";
import {
  IPaymentRepository,
  PaymentWithOrder,
} from "../interface/Ipaymentrepository.js";

@injectable()
export class PaymentRepository implements IPaymentRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<PaymentWithOrder | null> {
    return this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            user: true,
            items: true,
          },
        },
      },
    });
  }

  async findByOrderId(orderId: bigint): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { orderId },
    });
  }

  async findByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { razorpayOrderId },
    });
  }

  async findByRazorpayPaymentId(
    razorpayPaymentId: string
  ): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { razorpayPaymentId },
    });
  }

  async create(data: {
    orderId: bigint;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    method: any;
    status: any;
    amount: number;
    refundAmount?: number;
     // ✅ ADD THESE:
  cardNetwork?: string | null;
  cardLast4?: string | null;
  cardType?: string | null;
  upiId?: string | null;
  bankName?: string | null;
  walletName?: string | null;
  }): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        razorpayOrderId: data.razorpayOrderId,
        razorpayPaymentId: data.razorpayPaymentId,
        method: data.method,
        status: data.status,
        amount: data.amount,
        refundAmount: data.refundAmount ?? 0,
         cardNetwork: data.cardNetwork,
      cardLast4: data.cardLast4,
      cardType: data.cardType,
      upiId: data.upiId,
      bankName: data.bankName,
      walletName: data.walletName,
      },
    });
  }

  async update(id: bigint, data: Partial<Payment>): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data,
    });
  }

  async updateByOrderId(
    orderId: bigint,
    data: Partial<Payment>
  ): Promise<Payment> {
    return this.prisma.payment.update({
      where: { orderId },
      data,
    });
  }
}
