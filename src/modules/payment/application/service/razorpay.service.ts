import Razorpay from "razorpay";
import crypto from "crypto";
import { injectable } from "tsyringe";

@injectable()
export class RazorpayService {
  private razorpay: Razorpay;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error("Razorpay credentials not configured");
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  /**
   * Create a Razorpay order
   */
  async createOrder(params: {
    amount: number; // in paise (100 paise = 1 INR)
    currency?: string;
    receipt?: string;
    notes?: Record<string, string>;
  }) {
    try {
      const order = await this.razorpay.orders.create({
        amount: params.amount,
        currency: params.currency || "INR",
        receipt: params.receipt,
        notes: params.notes,
      });

      return order;
    } catch (error) {
      console.error("Razorpay order creation failed:", error);
      throw new Error("Failed to create payment order");
    }
  }

  /**
   * Verify payment signature
   */
  verifyPaymentSignature(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): boolean {
    try {
      const keySecret = process.env.RAZORPAY_KEY_SECRET!;
      const body = params.razorpay_order_id + "|" + params.razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(body)
        .digest("hex");

      return expectedSignature === params.razorpay_signature;
    } catch (error) {
      console.error("Signature verification failed:", error);
      return false;
    }
  }

  /**
   * Fetch payment details
   */
  async fetchPayment(paymentId: string) {
    try {
      return await this.razorpay.payments.fetch(paymentId);
    } catch (error) {
      console.error("Failed to fetch payment:", error);
      throw new Error("Failed to fetch payment details");
    }
  }

  /**
   * Capture payment
   */
  async capturePayment(paymentId: string, amount: number, currency = "INR") {
    try {
      return await this.razorpay.payments.capture(paymentId, amount, currency);
    } catch (error) {
      console.error("Failed to capture payment:", error);
      throw new Error("Failed to capture payment");
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentId: string, amount?: number) {
    try {
      const refundData: any = { payment_id: paymentId };
      if (amount) {
        refundData.amount = amount;
      }

      return await this.razorpay.payments.refund(paymentId, refundData);
    } catch (error) {
      console.error("Failed to refund payment:", error);
      throw new Error("Failed to process refund");
    }
  }

  /**
   * Fetch order
   */
  async fetchOrder(orderId: string) {
    try {
      return await this.razorpay.orders.fetch(orderId);
    } catch (error) {
      console.error("Failed to fetch order:", error);
      throw new Error("Failed to fetch order details");
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const keySecret = process.env.RAZORPAY_WEBHOOK_SECRET!;
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(payload)
        .digest("hex");

      return expectedSignature === signature;
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      return false;
    }
  }
}
