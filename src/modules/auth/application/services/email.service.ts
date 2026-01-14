import nodemailer from "nodemailer";
import axios from "axios";

function createTransporter() {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "qa") {
    return nodemailer.createTransport({
      host: process.env.SES_SMTP_HOST!,
      port: Number(process.env.SES_SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SES_SMTP_USER!,
        pass: process.env.SES_SMTP_PASS!,
      },
    });
  }
console.log("EMAIL_PASS", process.env.EMAIL_PASS);

  // ✅ development → Gmail
  return nodemailer.createTransport({
    secure:true,
    host: "smtp.gmail.com",
    port: 465,
    auth: {
      user: process.env.EMAIL_USER!, // ✅ from .env
      pass: process.env.EMAIL_PASS!, // ✅ Gmail App Password
    },
  });
}
const transporter = createTransporter();

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://kankansilks.com"
    : process.env.NODE_ENV === "qa"
    ? "https://qa.kankansilks.com"
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

  await transporter.sendMail({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: "Reset Your Password - Kankanasilks",
    html,
  });
}

// Optional: Use external email API service (like SendGrid, Mailgun) via axios
export async function sendEmailViaAPI(
  to: string,
  subject: string,
  html: string
) {
  // Example using a hypothetical email API
  const API_KEY = process.env.EMAIL_API_KEY;
  const EMAIL_API_URL = process.env.EMAIL_API_URL;

  if (!API_KEY || !EMAIL_API_URL) {
    throw new Error("Email API not configured");
  }

  const response = await axios.post(
    EMAIL_API_URL,
    {
      to,
      subject,
      html,
      from: process.env.EMAIL_FROM || "noreply@kanganasilks.com",
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}
