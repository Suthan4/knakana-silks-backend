import "dotenv/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET } =
  process.env;

if (
  !AWS_REGION ||
  !AWS_ACCESS_KEY_ID ||
  !AWS_SECRET_ACCESS_KEY ||
  !AWS_S3_BUCKET
) {
  throw new Error("Missing AWS environment variables");
}

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

async function testPrivateFile() {
  try {
    // Step 1: Upload a PRIVATE file (no ACL: "public-read")
    const uploadCommand = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: "private/secret-image.jpg",
      Body: "This is a private file!",
      ContentType: "text/plain",
      // ⚠️ NO ACL - file is private by default
    });

    await s3Client.send(uploadCommand);
    console.log("✅ Private file uploaded!");

    // Step 2: Try direct URL (will fail)
    const directUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/private/secret-image.jpg`;
    console.log("\n❌ Direct URL (won't work):");
    console.log(directUrl);

    // Step 3: Generate signed URL (will work!)
    const getCommand = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: "private/secret-image.jpg",
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 3600, // 1 hour in seconds
    });

    console.log("\n✅ Signed URL (copy this to browser):");
    console.log(signedUrl);
    console.log("\n⏰ This URL expires in 1 hour");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

testPrivateFile();
