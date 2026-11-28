# Amazon SES setup for Kankana Silks

This backend sends application emails through Amazon SES in **Asia Pacific (Mumbai), ap-south-1**. The implementation uses the AWS SDK default credential provider chain; it does not use SMTP credentials or hardcoded AWS keys.

## 1. Environment

The shared email transport supports two providers. Set `EMAIL_PROVIDER` explicitly per deployment:

- QA: `EMAIL_PROVIDER=nodemailer` and configure the SMTP variables below.
- Production: `EMAIL_PROVIDER=ses` and use the EC2 IAM role; no SMTP credentials are needed.

For QA SMTP, configure `SMTP_HOST`, `SMTP_PORT` (usually `587`), `SMTP_SECURE` (`false` for STARTTLS on 587, `true` for implicit TLS on 465), `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM_EMAIL`. Keep SMTP credentials only in the QA server environment/secrets, never in Git. Nodemailer is only selected when explicitly configured or when `APP_ENV=qa`.

Copy the relevant values from `.env.ses.example` into the backend environment:

- `AWS_SES_REGION=ap-south-1`
- `SES_FROM_EMAIL=notifications@kankanasilks.com`
- `SES_NOTIFICATIONS_FROM=notifications@kankanasilks.com`
- `SES_NO_REPLY_FROM=no-reply@kankanasilks.com`
- `SES_NEWSLETTER_FROM=newsletter@kankanasilks.com`
- `SES_REPLY_TO_EMAIL=support@kankanasilks.com`
- `ADMIN_EMAIL=admin@kankanasilks.com`
- `SES_CONFIGURATION_SET` is optional. Leave it unset until a configuration set has been created in SES.

All From addresses must use an SES-verified identity. The verified `kankanasilks.com` domain identity authorizes sender addresses under that domain; individual mailboxes do not need separate SES identities.

## 2. AWS permissions

For an EC2 deployment, attach an IAM role to the instance and grant only SES sending permission for the verified domain identity. Replace `ACCOUNT_ID` with the AWS account ID:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail"],
      "Resource": "arn:aws:ses:ap-south-1:ACCOUNT_ID:identity/kankanasilks.com"
    }
  ]
}
```

The AWS SDK obtains temporary credentials from the EC2 instance role. Do not add AWS access keys to the application environment or source code.

## 3. SES account settings

Before sending to real customers:

1. Confirm the domain identity is verified in SES in Mumbai.
2. Confirm DKIM is enabled and DNS records are published.
3. Request production access if the account is still in the SES sandbox.
4. Verify the From addresses/domain align with the SES identity.
5. Optionally create a configuration set and set `SES_CONFIGURATION_SET`.

SNS is not required to send messages. SNS event handling (bounce/complaint/delivery processing) is a separate follow-up integration and is not part of this SES transport change.

## 4. Email routing

- Order and notification emails use the shared email transport and follow `EMAIL_PROVIDER`.
- Password-reset emails, OTP emails, and newsletter notification/welcome emails use the same transport.
- The existing PostgreSQL-backed email job worker and retry behavior are retained.
- `admin@kankanasilks.com` receives newsletter subscription alerts and any existing admin notifications already routed by application workflows.
- `support@kankanasilks.com` is the default Reply-To address.

This transport migration does not invent new order lifecycle notifications. It preserves the notification calls already present in the backend.

## 5. Zoho credential rotation

The old auth email service had a Zoho app password hardcoded in Git history. The code no longer uses that credential, but a code change cannot revoke a secret that was previously committed. Revoke the exposed Zoho app password in Zoho Mail and generate a new one only if another application still needs Zoho SMTP. Do not reuse the exposed password.

## 6. Verification

Run locally or in CI:

```bash
npm ci
npx prisma generate
npm run build
npm test
```

Then perform a controlled test email using the configured From address. Confirm delivery in the recipient inbox and verify that SES shows the send/delivery event in its metrics.

Live delivery cannot be verified by the repository build alone; it requires valid AWS IAM permissions, SES production access, and a verified sending identity in the target AWS account/region.
