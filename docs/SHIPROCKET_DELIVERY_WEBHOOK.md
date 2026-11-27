# Shiprocket delivery status webhook

The backend receives Shiprocket tracking events at:

`POST https://api.kankanasilks.com/api/webhooks/delivery-status`

This callback is registered by the existing shipment router. Keep the URL free of the provider-reserved keywords documented by Shiprocket.

## Backend environment

Set `SHIPROCKET_WEBHOOK_SECRET` in the backend deployment environment to a strong random token. Do not commit the value to Git.

## Shiprocket dashboard setup

1. Sign in to Shiprocket.
2. Open **Settings → API → Webhooks**.
3. Add the callback URL above and enable the webhook.
4. Add the same token configured as `SHIPROCKET_WEBHOOK_SECRET` as the security token.
5. Configure JSON POST delivery updates.

Shiprocket sends the configured security token in the `x-api-key` request header. The callback rejects requests when the secret is not configured or does not match.

## Status behavior

- Shipment status ID `7` (Delivered) updates the local order to `DELIVERED` and sets `Shipment.deliveredAt`.
- Delivery confirmation email is sent only when the order changes into the delivered state.
- Repeated webhook deliveries do not resend the delivery email.
- RTO Delivered (status ID `10`) and Partial Delivered (status ID `23`) are not treated as successful customer delivery.
- Admin shipment data refreshes every 30 seconds while the page is open.

The manual admin mark-as-delivered endpoint and button have been removed. Delivery state must come from Shiprocket tracking confirmation.
