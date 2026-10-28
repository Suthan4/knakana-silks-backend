# Direct-to-S3 image upload setup

The admin uploads an image to a short-lived staging/<admin-user-id>/... object using a presigned PUT URL. The browser then calls the authenticated finalize endpoint. Finalization validates the actual bytes and sends them through the existing compression policy before returning a permanent media URL. Do not save staging URLs in product records.

## S3 CORS

Merge the following rule into the bucket's existing CORS configuration; do not overwrite other rules needed by the storefront or CDN.

```json
[
  {
    "AllowedOrigins": [
      "https://admin.kankanasilks.com",
      "https://qa.admin.kankanasilks.com",
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    "AllowedMethods": [
      "PUT"
    ],
    "AllowedHeaders": [
      "content-type",
      "x-amz-*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 300
  }
]
```

If additional admin origins are used, add only the exact trusted origin. Do not use * for production admin uploads.

## Lifecycle cleanup

Configure an S3 lifecycle rule on prefix staging/ to expire objects after **1 day**. A browser may close after uploading but before finalize; this rule prevents abandoned staging files from accumulating. The finalizer deletes the staging object after the permanent object has been written successfully.

## Limits and processing

- Presigned staging upload: up to 100 MB declared input; the finalizer independently checks actual object size before reading it.
- The browser sends bytes directly to S3, avoiding a 100 MB multipart request through the API server.
- The backend still downloads one staged object into memory for Sharp validation/optimization. Uploads are sequential in the shared product form to bound concurrent memory use.
- Compression disabled: supported source bytes are stored unchanged after magic-byte validation.
- Compression enabled: the existing image optimizer converts supported input formats to WebP and applies the configured quality policy.
- Unsupported/corrupt formats fail at finalize and must not be saved as product media.

## Rollout checklist

1. Apply the Prisma image compression settings migration to QA first.
2. Confirm the backend role used by the API can s3:PutObject, s3:GetObject, s3:HeadObject, and s3:DeleteObject on the configured bucket and staging/* prefix.
3. Apply/merge the CORS and lifecycle configuration above.
4. Verify an admin token can request a URL, upload a 40–60 MB image, finalize it, and receive a permanent URL.
5. Verify a non-admin gets 403, a different admin cannot finalize another user's staging key, an oversized object is rejected, and failed optimization never returns a permanent URL.
6. Check that no database product/variant media row contains a staging/ URL.