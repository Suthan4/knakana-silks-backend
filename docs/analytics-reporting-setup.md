# Analytics reporting API setup

## Environment
Set on the backend only:

```env
GA4_PROPERTY_ID=123456789
GA4_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
CLARITY_API_TOKEN=your_clarity_data_export_token
```

Store the service-account JSON securely in the deployment secret store. Do not commit real credentials or put them in frontend environment variables.

## GA4 access
1. Create a Google Cloud service account and enable the Google Analytics Data API.
2. Add the service account email to the GA4 property with Viewer access.
3. Set `GA4_PROPERTY_ID` to the numeric GA4 property ID and `GA4_SERVICE_ACCOUNT_JSON` to the service-account JSON as a single-line JSON value.
4. Set the GA4 property timezone to Asia/Kolkata.

## Clarity access
Generate a Data Export API token in Clarity project Settings -> Data Export and set it as `CLARITY_API_TOKEN`.

Clarity's documented export endpoint only returns the most recent 1, 2, or 3 days, permits at most 10 requests per project per day, and returns at most 1,000 rows without pagination. This integration fetches a 3-day view. It does not claim to provide historical monthly Clarity data. To build historical Clarity reports, add a daily snapshot job and persistent storage in a later step.

## Endpoints
All endpoints require authentication and the existing `orders:read` permission:
- `GET /api/admin/analytics/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `GET /api/admin/analytics/export?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&format=csv|xlsx`

The JSON report endpoint can also be used as a read-only Power BI source. GA4 report rows are date/channel-level and include sessions, users, views, add-to-carts, checkouts, purchases, and purchase revenue.
