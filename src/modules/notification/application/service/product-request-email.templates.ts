export interface ProductRequestEmailContext {
  id: bigint | string;
  requestNumber: string;
  quantity: number;
  notifyWhenAvailable?: boolean | null;
  customerNote?: string | null;
  user: { email: string; firstName: string; lastName: string };
  product: { name: string; slug: string };
  variant?: { size?: string | null; color?: string | null; fabric?: string | null } | null;
}

export interface EmailJobInput {
  recipient: string;
  subject: string;
  html: string;
}

const ADMIN_EMAIL = "admin@kankanasilks.com";
const BRAND_COLOR = "#F8F0EF";
const LOGO_URL =
  process.env.EMAIL_LOGO_URL?.trim() ||
  "https://www.kankanasilks.com/kankana-silks-logo.png";
const ADMIN_REQUESTS_URL =
  process.env.ADMIN_PRODUCT_REQUEST_URL?.trim() ||
  "https://admin.kankanasilks.com/admin/product-request";
const CUSTOMER_URL = (
  process.env.FRONTEND_URL?.trim() || "https://www.kankanasilks.com"
).replace(/\/$/, "");

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return entities[character];
  });
}

function variantText(request: ProductRequestEmailContext): string {
  return [request.variant?.size, request.variant?.color, request.variant?.fabric]
    .filter(Boolean)
    .join(" / ");
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:24px 12px;background:${BRAND_COLOR};font-family:Arial,Helvetica,sans-serif;color:#302629;line-height:1.65">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #eadfdd;border-radius:12px;overflow:hidden">
      <div style="padding:24px 28px;background:${BRAND_COLOR};text-align:center;border-bottom:1px solid #eadfdd">
        <img
          src="${escapeHtml(LOGO_URL)}"
          alt="Kankana Silks"
          width="190"
          style="display:block;width:190px;max-width:70%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none"
        />
      </div>
      <div style="padding:28px 30px;background:#ffffff">
        <h2 style="margin:0 0 18px;font-size:21px;line-height:1.35;font-weight:700;color:#302629">${escapeHtml(title)}</h2>
        ${body}
      </div>
      <div style="padding:18px 28px;background:${BRAND_COLOR};border-top:1px solid #eadfdd;text-align:center;color:#66595b;font-size:12px">
        <p style="margin:0 0 5px;font-weight:600;color:#493b3e">Kankana Silks</p>
        <p style="margin:0">Thank you for choosing Kankana Silks.</p>
        <p style="margin:6px 0 0"><a href="mailto:support@kankanasilks.com" style="color:#493b3e;text-decoration:underline">support@kankanasilks.com</a></p>
      </div>
    </div>
  </body>
</html>`;
}

function details(request: ProductRequestEmailContext): string {
  const variant = variantText(request);
  return `<div style="padding:16px;background:${BRAND_COLOR};border:1px solid #EADFDB;border-radius:8px;margin:18px 0">
    <p style="margin:4px 0"><strong>Request:</strong> ${escapeHtml(request.requestNumber)}</p>
    <p style="margin:4px 0"><strong>Product:</strong> ${escapeHtml(request.product.name)}</p>
    ${variant ? `<p style="margin:4px 0"><strong>Variant:</strong> ${escapeHtml(variant)}</p>` : ""}
    <p style="margin:4px 0"><strong>Quantity:</strong> ${request.quantity}</p>
  </div>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 18px;background:${BRAND_COLOR};border:1px solid #EADFDB;color:#493B3E;text-decoration:none;border-radius:6px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function customerRequestUrl(id: bigint | string): string {
  return `${CUSTOMER_URL}/my-account/product-requests?requestId=${encodeURIComponent(String(id))}`;
}

export function buildRequestSubmittedEmailJobs(request: ProductRequestEmailContext): EmailJobInput[] {
  const customerName = [request.user.firstName, request.user.lastName].filter(Boolean).join(" ");
  return [
    {
      recipient: request.user.email,
      subject: `We received your product request – ${request.requestNumber}`,
      html: layout("We received your product request", `
        <p>Hi ${escapeHtml(request.user.firstName || "there")},</p>
        <p>Thank you for your interest. We have received your request and our team will review it.</p>
        ${details(request)}
        <p>We will let you know when there is an update.</p>
        ${button(customerRequestUrl(request.id), "View my request")}
      `),
    },
    {
      recipient: ADMIN_EMAIL,
      subject: `New product request: ${request.requestNumber}`,
      html: layout("New product request received", `
        <p>A customer has submitted a product request. Please review it in the admin panel.</p>
        ${details(request)}
        <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(request.user.email)}</p>
        ${request.customerNote ? `<p><strong>Customer note:</strong> ${escapeHtml(request.customerNote)}</p>` : ""}
        ${button(ADMIN_REQUESTS_URL, "Review product requests")}
      `),
    },
  ];
}

export function buildRestockedRequestClosedEmailJobs(request: ProductRequestEmailContext): EmailJobInput[] {
  const jobs: EmailJobInput[] = [{
    recipient: ADMIN_EMAIL,
    subject: `Product restocked and request closed: ${request.requestNumber}`,
    html: layout("Product request closed after restock", `
      <p>The requested product became purchasable after a stock update. The request was automatically closed.</p>
      ${details(request)}
      <p><strong>Customer:</strong> ${escapeHtml(request.user.firstName)} ${escapeHtml(request.user.lastName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(request.user.email)}</p>
      ${button(ADMIN_REQUESTS_URL, "Open product requests")}
    `),
  }];

  if (request.user.email && request.notifyWhenAvailable !== false) {
    jobs.unshift({
      recipient: request.user.email,
      subject: `Good news — ${request.product.name} is available again`,
      html: layout("Good news — your product is available", `
        <p>Hi ${escapeHtml(request.user.firstName || "there")},</p>
        <p>The product you requested is available again. Your request has been marked as <strong>Closed</strong>.</p>
        ${details(request)}
        <p>You can now visit Kankana Silks and check the product.</p>
        ${button(`${CUSTOMER_URL}/product/${encodeURIComponent(request.product.slug)}`, "View product")}
      `),
    });
  }
  return jobs;
}

export function buildManuallyClosedRequestEmailJobs(request: ProductRequestEmailContext): EmailJobInput[] {
  const jobs: EmailJobInput[] = [{
    recipient: ADMIN_EMAIL,
    subject: `Product request manually closed: ${request.requestNumber}`,
    html: layout("Product request manually closed", `
      <p>A product request was manually closed by an admin.</p>
      ${details(request)}
      <p><strong>Customer:</strong> ${escapeHtml(request.user.firstName)} ${escapeHtml(request.user.lastName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(request.user.email)}</p>
      ${button(ADMIN_REQUESTS_URL, "Open product requests")}
    `),
  }];

  if (request.user.email) {
    jobs.unshift({
      recipient: request.user.email,
      subject: `Your product request has been closed – ${request.requestNumber}`,
      html: layout("Your product request has been closed", `
        <p>Hi ${escapeHtml(request.user.firstName || "there")},</p>
        <p>Our team has closed your product request. This update does not by itself confirm product availability, so please check the product page before placing an order.</p>
        ${details(request)}
        ${button(customerRequestUrl(request.id), "View my request")}
      `),
    });
  }
  return jobs;
}
