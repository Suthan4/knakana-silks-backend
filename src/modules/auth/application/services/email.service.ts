import { sendSesEmail } from "@/modules/notification/infrastructure/ses-email.transport.js";

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://kankanasilks.com"
    : process.env.NODE_ENV === "qa"
      ? "https://qa.kankanasilks.com"
      : "http://localhost:3001");

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

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

  await sendSesEmail({
    from: process.env.SES_NO_REPLY_FROM || "no-reply@kankanasilks.com",
    replyTo: process.env.SES_REPLY_TO_EMAIL || "support@kankanasilks.com",
    to: email,
    subject: "Reset Your Password - Kankana Silks",
    html,
  });
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);

export async function sendNewsletterSubscriptionEmail(subscriberEmail: string) {
  const safeEmail = escapeHtml(subscriberEmail);
  const sender = process.env.SES_NEWSLETTER_FROM || process.env.SES_FROM_EMAIL || "notifications@kankanasilks.com";
  const replyTo = process.env.SES_REPLY_TO_EMAIL || "support@kankanasilks.com";

  await sendSesEmail({
    from: sender,
    replyTo,
    to: process.env.ADMIN_EMAIL || "admin@kankanasilks.com",
    subject: "New Newsletter Subscriber - Kankana Silks",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Newsletter Subscriber</h2>
        <p>A new user has subscribed to the newsletter:</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      </div>
    `,
  });

  await sendSesEmail({
    from: sender,
    replyTo,
    to: subscriberEmail,
    subject: "Welcome to Kankana Silks Newsletter!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Kankana Silks</h1>
        </div>
        <div style="padding: 20px; background-color: #f9fafb;">
          <h2>Thank you for subscribing!</h2>
          <p>You'll be the first to know about our new collections, exclusive offers, and heritage silk stories.</p>
          <p>— The Kankana Silks Team</p>
        </div>
      </div>
    `,
  });
}


export async function sendLoginOtpEmail(email: string, otp: string) {
  await sendSesEmail({
    from: process.env.SES_NO_REPLY_FROM || process.env.SES_FROM_EMAIL || "notifications@kankanasilks.com",
    replyTo: process.env.SES_REPLY_TO_EMAIL || "support@kankanasilks.com",
    to: email,
    subject: "Your Kankana Silks verification code",
    text: `Your Kankana Silks verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222"><h2>Kankana Silks</h2><p>Use this code to sign in or create your account.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${otp}</div><p>This code expires in 5 minutes. If you did not request it, ignore this email.</p></div>`,
  });
}
