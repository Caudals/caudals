import {
  createSpacesClient,
  getSpacesRuntimeConfig,
} from "@/lib/storage/spaces-config";

// DigitalOcean Spaces client configuration
// Spaces is S3-compatible, so we use the AWS SDK
export const spacesRuntimeConfig = getSpacesRuntimeConfig();
export const spacesClient = createSpacesClient();

export const SPACES_BUCKET = spacesRuntimeConfig.bucket;
export const CDN_URL = spacesRuntimeConfig.cdnUrl;
