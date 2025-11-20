import { S3Client } from "@aws-sdk/client-s3";

// DigitalOcean Spaces client configuration
// Spaces is S3-compatible, so we use the AWS SDK
export const spacesClient = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: false, // Needed for DigitalOcean Spaces
});

export const SPACES_BUCKET = process.env.DO_SPACES_BUCKET || "caudals-storage";
export const CDN_URL = process.env.NEXT_PUBLIC_DO_SPACES_CDN_URL || "";
