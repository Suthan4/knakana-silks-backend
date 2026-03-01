import { injectable, inject } from "tsyringe";
import { IOrderRepository } from "../../infrastructure/interface/Iorderrepository.js";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

@injectable()
export class InvoiceService {
  private logoBuffer: Buffer;
  constructor(
    @inject("IOrderRepository") private orderRepository: IOrderRepository
    
  ) {
    const logoPath = path.join(
      process.cwd(),
      "public",
      "images",
      "kankana-silks-logo.png"
    );

    this.logoBuffer = fs.readFileSync(logoPath);
  }

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
    if (!["PROCESSING","DELIVERED", "COMPLETED", "SHIPPED"].includes(order.status)) {
      throw new Error("Invoice is only available for shipped/delivered orders");
    }

    return this.createInvoicePDF(order);
  }

/**
   * Create PDF invoice document — all fixes applied
   * Fix 1: Order No & Date no longer overlap
   * Fix 2: Variant attributes shown under each item  
   * Fix 3: CGST 2.5% + SGST 2.5% matching checkout exactly
   * Fix 4: Courier charges as separate line
   * Fix 5: Footer always on same page — no extra blank page
   * Fix 6: "Rs." used instead of ₹ (Helvetica cannot render ₹ glyph)
   */
  private async createInvoicePDF(order: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // bufferPages:true allows us to write footer on every page at the end
      const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // FIX #6: "Rs." — Helvetica cannot render the ₹ Unicode glyph (U+20B9)
      // It renders as a box/quote/number. Use "Rs." which is universally readable.
      const rs = (amount: number | string): string =>
        `Rs. ${Number(amount).toFixed(2)}`;

      // ─── HEADER ────────────────────────────────────────────────────
      // Logo
      const logoX = 50;
      const logoY = 45;
      const logoWidth = 55;

      doc.image(this.logoBuffer, logoX, logoY, {
        width: logoWidth,
      });

      // Text start position (right of logo)
      const textX = logoX + logoWidth + 10;

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#555555")
        .text("Premium Silk Sarees & Fabrics", textX, 55)
        .text("www.kankanasilks.com", textX, 68)
        .text("support@kankanasilks.com", textX, 81);

      // Right side: TAX INVOICE
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text("TAX INVOICE", 350, 50, { width: 195, align: "right" });

      // Invoice No — label on one line, value on next (no overlap)
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#333333")
        .text("Invoice No:", 350, 80, { width: 195, align: "right" });
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#1a1a1a")
        .text(order.orderNumber, 350, 92, { width: 195, align: "right" });

      // Date — label and value each on own line
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#333333")
        .text("Date:", 350, 108, { width: 195, align: "right" });
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#1a1a1a")
        .text(
          new Date(order.createdAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          350, 120,
          { width: 195, align: "right" }
        );

      // Divider
      doc.moveTo(50, 145).lineTo(545, 145).strokeColor("#cccccc").lineWidth(1).stroke();

      // ─── ADDRESSES ─────────────────────────────────────────────────
      let y = 162;

      doc
        .fontSize(10).font("Helvetica-Bold").fillColor("#1a1a1a")
        .text("Bill To:", 50, y)
        .text("Ship To:", 310, y);

      const writeAddress = (addr: any, x: number, startY: number): number => {
        let ay = startY + 16;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#1a1a1a")
          .text(addr.fullName, x, ay, { width: 220 });
        ay += 13;
        doc.font("Helvetica").fillColor("#444444")
          .text(addr.addressLine1, x, ay, { width: 220 });
        ay += 12;
        if (addr.addressLine2) {
          doc.text(addr.addressLine2, x, ay, { width: 220 });
          ay += 12;
        }
        doc.text(`${addr.city}, ${addr.state} - ${addr.pincode}`, x, ay, { width: 220 });
        ay += 12;
        doc.fillColor("#555555").text(`Phone: ${addr.phone}`, x, ay, { width: 220 });
        return ay;
      };

      const billEnd = writeAddress(order.billingAddress, 50, y);
      const shipEnd = writeAddress(order.shippingAddress, 310, y);
      y = Math.max(billEnd, shipEnd) + 20;

      doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();

      // ─── ITEMS TABLE ───────────────────────────────────────────────
      y += 12;

      // Table header
      doc.rect(50, y - 4, 495, 20).fillColor("#f5f5f5").fill();
      doc
        .fontSize(9).font("Helvetica-Bold").fillColor("#333333")
        .text("#", 55, y, { width: 20 })
        .text("Item Description", 80, y, { width: 270 })
        .text("Qty", 355, y, { width: 40, align: "center" })
        .text("Unit Price", 400, y, { width: 70, align: "right" })
        .text("Amount", 475, y, { width: 65, align: "right" });

      y += 20;
      doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
      y += 8;

      doc.font("Helvetica").fillColor("#1a1a1a");

      // CONTENT_BOTTOM: leave 160px for totals + footer on same page
      const CONTENT_BOTTOM = doc.page.height - 160;

      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const itemName = item.product?.name || item.productName || "Product";
        const quantity = item.quantity;
        const price = Number(item.price);
        const amount = price * quantity;

        // Variant string
        let variantLine = "";
        if (item.variant?.attributes) {
          variantLine = Object.entries(item.variant.attributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join("  |  ");
        }

        const nameH = doc.fontSize(9).heightOfString(itemName, { width: 270 });
        const varH = variantLine
          ? doc.fontSize(8).heightOfString(variantLine, { width: 270 }) + 4
          : 0;
        const rowH = nameH + varH + 14;

        if (y + rowH > CONTENT_BOTTOM) {
          doc.addPage();
          y = 50;
        }

        if (i % 2 === 1) {
          doc.rect(50, y - 3, 495, rowH).fillColor("#fafafa").fill();
        }

        doc.fontSize(9).font("Helvetica").fillColor("#888888")
          .text(`${i + 1}`, 55, y, { width: 20 });

        doc.font("Helvetica-Bold").fillColor("#1a1a1a")
          .text(itemName, 80, y, { width: 270 });

        if (variantLine) {
          doc.font("Helvetica").fontSize(8).fillColor("#777777")
            .text(variantLine, 80, y + nameH + 2, { width: 270 });
        }

        doc.fontSize(9).font("Helvetica").fillColor("#1a1a1a")
          .text(String(quantity), 355, y, { width: 40, align: "center" })
          .text(rs(price), 400, y, { width: 70, align: "right" })
          .text(rs(amount), 475, y, { width: 65, align: "right" });

        y += rowH;
      }

      // Table bottom border
      doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();

      // ─── TOTALS ────────────────────────────────────────────────────
      y += 14;

      const subtotal    = Number(order.subtotal);
      const discount    = Number(order.discount || 0);
      const shipping    = Number(order.shippingCost || 0);
      const taxableBase = subtotal - discount + shipping;
      const cgst        = Math.round(taxableBase * 0.025 * 100) / 100;
      const sgst        = Math.round(taxableBase * 0.025 * 100) / 100;
      const total       = Number(order.total); // use DB total as source of truth

      const SX = 330;   // summary label x
      const VX = 470;   // value x
      const SW = 135;   // label width
      const VW = 70;    // value width

      const summaryRow = (
        label: string,
        value: string,
        bold = false,
        color = "#444444"
      ) => {
        doc
          .fontSize(9)
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fillColor(color)
          .text(label, SX, y, { width: SW, align: "left" })
          .text(value, VX, y, { width: VW, align: "right" });
        y += 17;
      };

      summaryRow("Subtotal:", rs(subtotal));

      if (discount > 0) {
        summaryRow(
          order.coupon?.code ? `Discount (${order.coupon.code}):` : "Discount:",
          `-${rs(discount)}`,
          false,
          "#16a34a"
        );
      }

      summaryRow("Courier Charges:", shipping === 0 ? "FREE" : rs(shipping));
      summaryRow("CGST (2.5%):", rs(cgst));
      summaryRow("SGST (2.5%):", rs(sgst));

      // Total bar
      doc.moveTo(SX, y - 4).lineTo(545, y - 4).strokeColor("#999999").lineWidth(0.5).stroke();
      doc.rect(SX - 5, y - 2, 220, 22).fillColor("#1a1a1a").fill();
      doc
        .fontSize(11).font("Helvetica-Bold").fillColor("#ffffff")
        .text("Total:", SX, y + 4, { width: SW, align: "left" })
        .text(rs(total), VX, y + 4, { width: VW, align: "right" });

      y += 40;

      // ─── PAYMENT INFO ──────────────────────────────────────────────
      doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").lineWidth(1).stroke();
      y += 14;

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#1a1a1a")
        .text("Payment Information", 50, y);
      y += 16;

      if (order.payment) {
        const method = this.getPaymentMethodLabel(order.payment.method);

        doc.fontSize(9).font("Helvetica").fillColor("#444444").text("Payment Method:", 50, y);
        doc.font("Helvetica-Bold").fillColor("#1a1a1a").text(method, 160, y);
        y += 14;

        if (order.payment.cardNetwork && order.payment.cardLast4) {
          doc.font("Helvetica").fillColor("#444444").text("Card:", 50, y);
          doc.font("Helvetica-Bold").fillColor("#1a1a1a")
            .text(`${order.payment.cardNetwork} **** ${order.payment.cardLast4}`, 160, y);
          y += 14;
        } else if (order.payment.upiId) {
          doc.font("Helvetica").fillColor("#444444").text("UPI ID:", 50, y);
          doc.font("Helvetica-Bold").fillColor("#1a1a1a").text(order.payment.upiId, 160, y);
          y += 14;
        }

        const statusColor = order.payment.status === "SUCCESS" ? "#16a34a" : "#dc2626";
        doc.font("Helvetica").fillColor("#444444").text("Payment Status:", 50, y);
        doc.font("Helvetica-Bold").fillColor(statusColor).text(order.payment.status, 160, y);
        y += 14;

        if (order.payment.razorpayPaymentId) {
          doc.fontSize(8).font("Helvetica").fillColor("#888888")
            .text(`Transaction ID: ${order.payment.razorpayPaymentId}`, 50, y);
          y += 12;
        }
      }

      // ─── FOOTER — written on EVERY page using bufferPages ──────────
      // FIX #5: bufferPages lets us iterate all pages and stamp footer
      // on each one, so it always appears at bottom of the last page
      // and never creates an extra blank page.
      const totalPages = doc.bufferedPageRange().count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        const pH = doc.page.height;

        doc.moveTo(50, pH - 62).lineTo(545, pH - 62)
          .strokeColor("#dddddd").lineWidth(0.8).stroke();

        doc
          .fontSize(8).font("Helvetica-Bold").fillColor("#555555")
          .text("Thank you for shopping with Kankana Silks!", 50, pH - 50,
            { align: "center", width: 495 });
        doc
          .fontSize(7.5).font("Helvetica").fillColor("#888888")
          .text("For queries: contact@kankanasilks.com  |  www.kankanasilks.com",
            50, pH - 37, { align: "center", width: 495 })
          .text("This is a computer-generated invoice and does not require a physical signature.",
            50, pH - 24, { align: "center", width: 495 });
      }

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