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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || "admin@kankanasilks.com";
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
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:Arial,sans-serif;color:#252525;line-height:1.6">
    <div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden">
      <div style="padding:22px 28px;background:#542b32;color:#fff"><h1 style="margin:0;font-size:22px">Kankana Silks</h1></div>
      <div style="padding:26px 28px"><h2 style="margin:0 0 16px;font-size:20px">${title}</h2>${body}</div>
      <div style="padding:16px 28px;background:#fafafa;color:#777;font-size:12px">Thank you for choosing Kankana Silks.</div>
    </div>
  </body></html>`;
}

function details(request: ProductRequestEmailContext): string {
  const variant = variantText(request);
  return `<div style="padding:16px;background:#faf7f7;border:1px solid #eee;border-radius:8px;margin:18px 0">
    <p style="margin:4px 0"><strong>Request:</strong> ${escapeHtml(request.requestNumber)}</p>
    <p style="margin:4px 0"><strong>Product:</strong> ${escapeHtml(request.product.name)}</p>
    ${variant ? `<p style="margin:4px 0"><strong>Variant:</strong> ${escapeHtml(variant)}</p>` : ""}
    <p style="margin:4px 0"><strong>Quantity:</strong> ${request.quantity}</p>
  </div>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 18px;background:#542b32;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></p>`;
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
