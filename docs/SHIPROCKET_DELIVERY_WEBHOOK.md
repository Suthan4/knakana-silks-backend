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

Shiprocket sends the configured security token in the `x-api-key` request header. The callback rejects requests when the secret is not configured or does not match. Shiprocket's Test Webhook is acknowledged with HTTP 200 after authentication even when it sends no real shipment identifiers.

## Status behavior

- Shipment status ID `7` (Delivered) updates the local order to `DELIVERED` and sets `Shipment.deliveredAt`.
- Delivery confirmation email is sent only when the order changes into the delivered state.
- Repeated webhook deliveries do not resend the delivery email.
- RTO Initiated (shipment status ID `9`) is stored as provider tracking state. Once RTO Delivered (shipment status ID `10`, or order status ID `16`) is confirmed, the order becomes `RETURNED`—never buyer `DELIVERED` or customer `CANCELLED`. No refund is issued automatically for RTO.
- Partial Delivered (ID `23`) is not treated as successful customer delivery.
- Reverse shipment events update the linked return shipment and return record separately:
  - Return Pickup Queued / Return Pickup Generated (`23` / `28`) → `PICKUP_SCHEDULED`
  - Return In Transit (`25`) → `IN_TRANSIT`
  - Return Delivered (`26`) → `RECEIVED`
  - Return Picked Up (`32`) → `PICKED_UP`
- Refunds remain `REFUND_INITIATED` until Razorpay sends `refund.processed`; a timer never marks them completed.
- Admin shipment, order, and returns views refresh every 30 seconds while the page is open.

The manual admin mark-as-delivered endpoint and button have been removed. Delivery state must come from Shiprocket tracking confirmation.

## Database deployment

The dev branch adds the migration `20261127193000_shiprocket_tracking_and_return_sync`. Deploy it to the **dev database only** after generating the Prisma client:

```bash
bunx prisma generate
bunx prisma migrate deploy
bun run build
```

Do not apply the dev migration to production until the same reviewed release is deployed there.
