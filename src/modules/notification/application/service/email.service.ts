import nodemailer, { Transporter } from "nodemailer";
import { injectable } from "tsyringe";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string;
  }>;
}

@injectable()
export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions) {
    try {
      const info = await this.transporter.sendMail({
        from:
          process.env.EMAIL_FROM || "Kangana Silks <noreply@kanganasilks.com>",
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });

      console.log("Email sent:", info.messageId);
      return info;
    } catch (error) {
      console.error("Failed to send email:", error);
      throw new Error("Failed to send email");
    }
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmation(data: {
    email: string;
    firstName: string;
    orderNumber: string;
    total: number;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
    }>;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .order-details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .total { font-size: 18px; font-weight: bold; color: #4F46E5; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
          </div>
          <div class="content">
            <h2>Thank you for your order, ${data.firstName}!</h2>
            <p>Your order has been successfully placed.</p>
            
            <div class="order-details">
              <h3>Order #${data.orderNumber}</h3>
              
              ${data.items
                .map(
                  (item) => `
                <div class="item">
                  <strong>${item.name}</strong><br>
                  Quantity: ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${(
                    item.quantity * item.price
                  ).toFixed(2)}
                </div>
              `
                )
                .join("")}
              
              <div class="total">
                Total: ₹${data.total.toFixed(2)}
              </div>
            </div>
            
            <p>We'll send you another email when your order ships.</p>
          </div>
          <div class="footer">
            <p>© 2024 Kangana Silks. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `Order Confirmation - ${data.orderNumber}`,
      html,
    });
  }

  /**
   * Send payment success email
   */
  async sendPaymentSuccess(data: {
    email: string;
    firstName: string;
    orderNumber: string;
    amount: number;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Payment Successful</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <div class="success">
              <p><strong>Your payment has been received!</strong></p>
              <p>Amount: ₹${data.amount.toFixed(2)}</p>
              <p>Order: ${data.orderNumber}</p>
            </div>
            <p>Your order is now being processed and will be shipped soon.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `Payment Received - ${data.orderNumber}`,
      html,
    });
  }

  /**
   * Send shipping notification
   */
  async sendShippingNotification(data: {
    email: string;
    firstName: string;
    orderNumber: string;
    trackingNumber?: string;
    courierName?: string;
    estimatedDelivery?: Date;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3B82F6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .shipping-info { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Order Shipped!</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Great news! Your order has been shipped.</p>
            
            <div class="shipping-info">
              <p><strong>Order:</strong> ${data.orderNumber}</p>
              ${
                data.trackingNumber
                  ? `<p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>`
                  : ""
              }
              ${
                data.courierName
                  ? `<p><strong>Courier:</strong> ${data.courierName}</p>`
                  : ""
              }
              ${
                data.estimatedDelivery
                  ? `<p><strong>Estimated Delivery:</strong> ${data.estimatedDelivery.toLocaleDateString()}</p>`
                  : ""
              }
            </div>
            
            <p>You can track your order using the tracking number above.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `Order Shipped - ${data.orderNumber}`,
      html,
    });
  }

  /**
   * Send delivery confirmation
   */
  async sendDeliveryConfirmation(data: {
    email: string;
    firstName: string;
    orderNumber: string;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Order Delivered!</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Your order <strong>${data.orderNumber}</strong> has been successfully delivered!</p>
            <p>We hope you love your purchase. If you have any questions or concerns, please don't hesitate to contact us.</p>
            <p>Thank you for shopping with Kangana Silks!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `Order Delivered - ${data.orderNumber}`,
      html,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(data: { email: string; resetToken: string }) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${data.resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #4F46E5; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
          }
          .warning { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy this link: ${resetUrl}</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: "Reset Your Password - Kangana Silks",
      html,
    });
  }

  /**
   * Send order cancellation email
   */
  async sendOrderCancellation(data: {
    email: string;
    firstName: string;
    orderNumber: string;
    reason: string;
    refundAmount: number;
    refundStatus: string;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #EF4444; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .info-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #EF4444; }
          .refund-box { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Cancelled</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Your order has been cancelled as requested.</p>
            
            <div class="info-box">
              <p><strong>Order Number:</strong> ${data.orderNumber}</p>
              <p><strong>Cancellation Reason:</strong> ${data.reason}</p>
              <p><strong>Cancelled On:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            ${
              data.refundAmount > 0
                ? `
            <div class="refund-box">
              <h3>Refund Information</h3>
              <p><strong>Refund Amount:</strong> ₹${data.refundAmount.toFixed(
                2
              )}</p>
              <p><strong>Status:</strong> ${data.refundStatus}</p>
              <p>The refund will be credited to your original payment method.</p>
            </div>
            `
                : ""
            }
            
            <p>If you have any questions, please contact our customer support.</p>
          </div>
          <div class="footer">
            <p>© 2024 Kangana Silks. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `Order Cancelled - ${data.orderNumber}`,
      html,
    });
  }
}
