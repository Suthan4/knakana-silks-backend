# Production authentication and checkout checklist

## Backup and secrets
- Back up PostgreSQL and test restore before applying the migration. Check current email-normalisation collisions before the unique index.
- Set distinct, high-entropy JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_RESET_SECRET and OTP_HMAC_SECRET values. Remove and rotate the previously committed Zoho SMTP credential and any other secrets in repository history.
- Configure TRUST_PROXY to the exact number of trusted proxy hops. A single trusted load balancer in front of the app normally uses 1; only trust known proxies.

## SES (ap-south-1)
- Verify the sending domain identity; enable DKIM; publish SPF and DMARC.
- Request SES production access (not sandbox).
- Create the configuration set with an SNS event destination for bounce and complaint events; confirm the HTTPS SNS subscription.
- Use an EC2/task IAM role limited to ses:SendEmail on the verified identity.
- Set AWS_SES_REGION, SES_FROM_EMAIL and SES_CONFIGURATION_SET.

## Redis
- Enable AUTH and TLS.
- OTP and rate-limit keys must not be evicted. Use noeviction or a dedicated DB/instance.

## Monitoring
- CloudWatch alarms: SES bounce rate >5%, complaint rate >0.1%, OTP verify failure-ratio spike, 5xx on /api/auth/refresh-token, Redis availability.
- Confirm weekly blocklist package-version logging and keep packages updated (Dependabot recommended).

## Checkout
- Configure COD new-account limit and 24-hour phone/address order caps.
- Populate and manage the phone/address blocklist through an admin-only workflow.
- Ensure delivery phone is required and validated; it is contact data, never customer identity.
- Verify order creation ignores client-provided userId and role.

## Smoke tests
1. Request OTP, receive email, verify, and confirm 5-minute expiry.
2. Confirm first-time users must provide firstName and lastName.
3. Verify wrong code, 5-attempt lockout, resend cooldown and per-email/IP/global rate limits.
4. Verify disposable domain/subdomain rejection, allowlist override, MX/no-MX/null-MX/transient DNS and suppression handling.
5. Exercise parallel refresh, 60-second rotation grace, reuse-family revocation and single-token logout.
6. Verify public registration, USER password login, email profile changes and USER password endpoints are rejected.
7. Send valid/invalid SNS signatures and permanent/transient bounce events.
8. Test COD amount caps, phone/address caps and blocklist rules.

## Storefront release blocker
The checked-in storefront AuthModal currently calls /auth/login, /auth/register and /auth/forgot-password. Those calls will be restricted for USER accounts by this migration. Update and deploy the OTP storefront separately before enabling the new contract; the frontend was intentionally left untouched here.
