import axios from "axios";
import { logger } from "@/shared/logger/logger.js";

/**
 * Uses the existing storefront revalidation configuration.
 * STOREFRONT_REVALIDATE_URL remains the full /api/revalidate-home URL;
 * product/category endpoints are derived from the same storefront origin.
 */
async function revalidateStorefrontEndpoint(
  endpoint: "home" | "product" | "category",
): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  const configuredHomeUrl = process.env.STOREFRONT_REVALIDATE_URL;

  if (!secret || !configuredHomeUrl) {
    logger.warn(
      `Storefront ${endpoint} revalidation skipped: REVALIDATE_SECRET or STOREFRONT_REVALIDATE_URL is not configured`,
    );
    return;
  }

  let url: string;
  try {
    url =
      endpoint === "home"
        ? configuredHomeUrl
        : new URL(`/api/revalidate-${endpoint}`, configuredHomeUrl).toString();
  } catch (error) {
    logger.error("Invalid STOREFRONT_REVALIDATE_URL", error, {
      configuredHomeUrl,
    });
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
    logger.info(`Storefront ${endpoint} cache revalidated`, { url });
  } catch (error) {
    // Cache invalidation is best-effort. A committed admin mutation must not
    // be reported as failed only because the storefront endpoint is unavailable.
    logger.error(`Storefront ${endpoint} revalidation failed`, error, { url });
  }
}

/** Invalidates homepage banner and home-section data after admin writes. */
export function revalidateStorefrontHome(): Promise<void> {
  return revalidateStorefrontEndpoint("home");
}

/** Invalidates public product detail and listing caches after product writes. */
export function revalidateStorefrontProducts(): Promise<void> {
  return revalidateStorefrontEndpoint("product");
}

/** Invalidates category details, hierarchy and affected product listings. */
export function revalidateStorefrontCategories(): Promise<void> {
  return revalidateStorefrontEndpoint("category");
}
