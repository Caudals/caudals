import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  createSpacesClient,
  getSpacesRuntimeConfig,
} from "@/lib/storage/spaces-config";

function cleanPrefix(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
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

async function bodyToString(body: unknown) {
  if (!body) {
    return "";
  }

  if (
    typeof body === "object" &&
    "transformToString" in body &&
    typeof body.transformToString === "function"
  ) {
    return body.transformToString();
  }

  throw new Error("Object storage response body is not readable");
}

async function main() {
  const config = getSpacesRuntimeConfig({ requireConfigured: true });
  const client = createSpacesClient({ requireConfigured: true });
  const prefix = cleanPrefix(
    process.env.CAUDALS_OBJECT_STORAGE_PROBE_PREFIX ??
      "caudals/probes/object-storage"
  );
  const payload = `caudals object storage probe ${new Date().toISOString()}\n`;
  const key = `${prefix}/${Date.now()}-${randomUUID()}.txt`;

  try {
    await client.send(
      new PutObjectCommand({
        Body: payload,
        Bucket: config.bucket,
        CacheControl: "private, max-age=0",
        ContentType: "text/plain; charset=utf-8",
        Key: key,
      })
    );
    console.log(`object_storage.write\tbucket=${config.bucket} prefix=${prefix}`);

    const readback = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );
    const body = await bodyToString(readback.Body);
    if (body !== payload) {
      throw new Error("Object storage readback payload mismatch");
    }
    console.log("object_storage.read\tpayload matched");

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );
    console.log("object_storage.delete\tprobe object removed");

    if (config.cdnUrl) {
      console.log("object_storage.cdn\tconfigured");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      sanitizeError(message, [config.accessKeyId, config.secretAccessKey])
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`object_storage.probe_failed\t${message}`);
  process.exit(1);
});
