import axios from "axios";
import { logger } from "@/shared/logger/logger.js";

/**
 * Invalidates the storefront's cached homepage after banner/home-section writes.
 * Revalidation is best-effort: a failed cache purge must not turn a successful
 * database mutation into an API error for the admin.
 */
export async function revalidateStorefrontHome(): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  const url = process.env.STOREFRONT_REVALIDATE_URL;

  if (!secret || !url) {
    logger.warn(
      "Homepage revalidation skipped: REVALIDATE_SECRET or STOREFRONT_REVALIDATE_URL is not configured",
    );
    return;
  }

  try {
    await axios.post(
      url,
      {},
      {
        headers: { "x-revalidate-secret": secret },
        timeout: 8_000,
      },
    );
    logger.info("Storefront homepage revalidated");
  } catch (error) {
    logger.error("Storefront homepage revalidation failed", error, { url });
  }
}
