import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "../../infrastructure/interface/Iorderrepository.js";
import PDFDocument from "pdfkit";

@injectable()
export class InvoiceService {
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository
  ) {}

  /**
   * Generate invoice PDF for an order
   */
  async generateInvoice(orderId: string, userId: string): Promise<Buffer> {
    const order = await this.orderRepository.findById(BigInt(orderId));

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId !== BigInt(userId)) {
      throw new Error("Unauthorized: You can only download invoices for your own orders");
    }

    // Only allow invoice download for completed/delivered orders
    if (!["DELIVERED", "COMPLETED", "SHIPPED"].includes(order.status)) {
      throw new Error("Invoice is only available for shipped/delivered orders");
    }

    return this.createInvoicePDF(order);
  }

  /**
   * Create PDF invoice document
   */
  private async createInvoicePDF(order: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("KANKANA SILKS", 50, 50);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text("Premium Silk Sarees & Fabrics", 50, 80)
        .text("www.kankanasilks.com", 50, 95)
        .text("contact@kankanasilks.com", 50, 110);

      // Invoice Title
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("TAX INVOICE", 400, 50, { align: "right" });

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`Invoice No: ${order.orderNumber}`, 400, 80, { align: "right" })
        .text(
          `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN")}`,
          400,
          95,
          { align: "right" }
        );

      // Line separator
      doc
        .moveTo(50, 140)
        .lineTo(545, 140)
        .stroke();

      // Billing & Shipping Addresses
      let y = 160;

      // Billing Address
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("Bill To:", 50, y);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(order.billingAddress.fullName, 50, y + 20)
        .text(order.billingAddress.addressLine1, 50, y + 35);

      if (order.billingAddress.addressLine2) {
        doc.text(order.billingAddress.addressLine2, 50, y + 50);
        y += 15;
      }

      doc
        .text(
          `${order.billingAddress.city}, ${order.billingAddress.state} - ${order.billingAddress.pincode}`,
          50,
          y + 50
        )
        .text(`Phone: ${order.billingAddress.phone}`, 50, y + 65);

      // Shipping Address
      y = 160;
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("Ship To:", 320, y);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(order.shippingAddress.fullName, 320, y + 20)
        .text(order.shippingAddress.addressLine1, 320, y + 35);

      if (order.shippingAddress.addressLine2) {
        doc.text(order.shippingAddress.addressLine2, 320, y + 50);
        y += 15;
      }

      doc
        .text(
          `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
          320,
          y + 50
        )
        .text(`Phone: ${order.shippingAddress.phone}`, 320, y + 65);

      // Items Table
      y = 280;
      doc
        .moveTo(50, y)
        .lineTo(545, y)
        .stroke();

      y += 10;

      // Table Headers
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Item", 50, y)
        .text("Qty", 350, y)
        .text("Price", 410, y)
        .text("Amount", 480, y);

      y += 20;
      doc
        .moveTo(50, y)
        .lineTo(545, y)
        .stroke();

      // Table Items
      doc.font("Helvetica");
      y += 10;

      for (const item of order.items) {
        const itemName = item.product.name;
        const quantity = item.quantity;
        const price = Number(item.price);
        const amount = price * quantity;

        // Item name (with wrapping)
        const nameHeight = doc.heightOfString(itemName, { width: 280 });

        doc
          .fontSize(10)
          .text(itemName, 50, y, { width: 280 })
          .text(quantity.toString(), 350, y)
          .text(`₹${price.toFixed(2)}`, 410, y)
          .text(`₹${amount.toFixed(2)}`, 480, y);

        // Add variant attributes if present
        if (item.variant?.attributes) {
          y += nameHeight + 5;
          const attrs = Object.entries(item.variant.attributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          doc.fontSize(8).fillColor("#666").text(attrs, 50, y, { width: 280 });
          doc.fillColor("#000");
        }

        y += Math.max(nameHeight, 15) + 15;

        // Add new page if needed
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
      }

      // Summary
      doc
        .moveTo(50, y)
        .lineTo(545, y)
        .stroke();

      y += 15;

      const subtotal = Number(order.subtotal);
      const discount = Number(order.discount);
      const shipping = Number(order.shippingCost);
      const gst = Number(order.gstAmount || 0);
      const total = Number(order.total);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text("Subtotal:", 380, y)
        .text(`₹${subtotal.toFixed(2)}`, 480, y);

      if (discount > 0) {
        y += 20;
        doc
          .text("Discount:", 380, y)
          .text(`-₹${discount.toFixed(2)}`, 480, y);
      }

      y += 20;
      doc
        .text("Shipping:", 380, y)
        .text(shipping === 0 ? "FREE" : `₹${shipping.toFixed(2)}`, 480, y);

      if (gst > 0) {
        y += 20;
        doc
          .text("GST (18%):", 380, y)
          .text(`₹${gst.toFixed(2)}`, 480, y);
      }

      y += 25;
      doc
        .moveTo(380, y - 5)
        .lineTo(545, y - 5)
        .stroke();

      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("Total:", 380, y)
        .text(`₹${total.toFixed(2)}`, 480, y);

      // Payment Info
      y += 40;
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Payment Information", 50, y);

      y += 20;
      doc.font("Helvetica");

      if (order.payment) {
        const paymentMethod = this.getPaymentMethodLabel(order.payment.method);
        doc.text(`Payment Method: ${paymentMethod}`, 50, y);

        if (order.payment.cardNetwork && order.payment.cardLast4) {
          y += 15;
          doc.text(
            `Card: ${order.payment.cardNetwork} •••• ${order.payment.cardLast4}`,
            50,
            y
          );
        } else if (order.payment.upiId) {
          y += 15;
          doc.text(`UPI ID: ${order.payment.upiId}`, 50, y);
        }

        y += 15;
        doc.text(`Payment Status: ${order.payment.status}`, 50, y);

        if (order.payment.razorpayPaymentId) {
          y += 15;
          doc
            .fontSize(8)
            .text(`Transaction ID: ${order.payment.razorpayPaymentId}`, 50, y);
        }
      }

      // Footer
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#666")
        .text(
          "Thank you for shopping with Kankana Silks!",
          50,
          750,
          { align: "center" }
        )
        .text(
          "For any queries, contact us at contact@kankanasilks.com",
          50,
          765,
          { align: "center" }
        );

      doc.end();
    });
  }

  /**
   * Get payment method display label
   */
  private getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      CARD: "Credit/Debit Card",
      UPI: "UPI Payment",
      NETBANKING: "Net Banking",
      WALLET: "Wallet",
      EMI: "EMI",
      PAYLATER: "Pay Later",
      COD: "Cash on Delivery",
    };
    return labels[method] || method;
  }
}