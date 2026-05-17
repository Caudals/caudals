import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

import {
  createSpacesClient,
  getSpacesRuntimeConfig,
} from "@/lib/storage/spaces-config";

function isMissingBucketError(error: unknown) {
  const candidate = error as {
    $metadata?: { httpStatusCode?: number };
    Code?: string;
    code?: string;
    name?: string;
  };

  return (
    candidate?.$metadata?.httpStatusCode === 404 ||
    candidate?.name === "NotFound" ||
    candidate?.name === "NoSuchBucket" ||
    candidate?.Code === "NoSuchBucket" ||
    candidate?.code === "NoSuchBucket"
  );
}

function sanitizeError(message: string, secrets: Array<string | undefined>) {
  let sanitized = message;
  for (const secret of secrets) {
    if (secret) {
      sanitized = sanitized.replaceAll(secret, "[redacted]");
    }
  }
  return sanitized;
}

async function main() {
  const config = getSpacesRuntimeConfig({ requireConfigured: true });
  const client = createSpacesClient({ requireConfigured: true });

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: config.bucket,
      })
    );
    console.log(`object_storage.bucket\tbucket=${config.bucket} state=exists`);
    return;
  } catch (error) {
    if (!isMissingBucketError(error)) {
      throw error;
    }
  }

  await client.send(
    new CreateBucketCommand({
      Bucket: config.bucket,
    })
  );
  console.log(`object_storage.bucket\tbucket=${config.bucket} state=created`);
}

main().catch((error) => {
  const config = getSpacesRuntimeConfig();
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `object_storage.bucket_failed\t${sanitizeError(message, [
      config.accessKeyId,
      config.secretAccessKey,
    ])}`
  );
  process.exit(1);
});
