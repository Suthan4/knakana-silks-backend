# Customer mobile OTP (MSG91)

The customer mobile sign-in endpoints use MSG91's OTP API.

## Environment

Configure these values in the backend deployment environment (never commit real values):

```env
MSG91_AUTHKEY=
MSG91_OTP_TEMPLATE_ID=
```

The MSG91 template must be approved and configured for a six-digit OTP. Keep the OTP expiry at five minutes. The API uses the MSG91 OTP send, verify, and retry endpoints.

## Routes

- `POST /auth/mobile/send-otp` — body: `{ "mobile": "9876543210" }`
- `POST /auth/mobile/verify-otp` — body: `{ "mobile": "9876543210", "otp": "123456" }`
- `POST /auth/mobile/resend-otp` — body: `{ "mobile": "9876543210" }`

Indian mobile numbers may be supplied as ten digits or with the `91` country code. The service normalizes them to MSG91's `91XXXXXXXXXX` format.

## Current scope

This first slice signs in an existing active customer account whose `users.phone` matches the verified mobile number (10-digit, 91-prefixed, or +91-prefixed). It does not create a new account, merge identities, or change the email/password registration flow. New-customer mobile OTP registration and profile completion must be implemented as a separate verified flow before advertising mobile OTP as a registration option.

The routes have a basic per-IP limit of five OTP requests per ten minutes. Use an API gateway/WAF or a shared rate-limit store before scaling horizontally; the default in-memory limiter is per process.
