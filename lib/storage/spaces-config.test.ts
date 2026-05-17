import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getSpacesRuntimeConfig } from "@/lib/storage/spaces-config";

const tempDirs: string[] = [];

function writeTempSecret(value: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-spaces-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "secret");
  writeFileSync(filePath, value, "utf8");
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("getSpacesRuntimeConfig", () => {
  it("reports direct DigitalOcean Spaces configuration as ready", () => {
    const config = getSpacesRuntimeConfig({
      env: {
        DO_SPACES_ACCESS_KEY_ID: "access",
        DO_SPACES_BUCKET: "caudals",
        DO_SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.com",
        DO_SPACES_REGION: "nyc3",
        DO_SPACES_SECRET_ACCESS_KEY: "secret",
        NEXT_PUBLIC_DO_SPACES_CDN_URL:
          "https://caudals.nyc3.cdn.digitaloceanspaces.com",
      },
    });

    expect(config.configured).toBe(true);
    expect(config.missing).toEqual([]);
    expect(config.bucket).toBe("caudals");
    expect(config.forcePathStyle).toBe(false);
  });

  it("enables path-style S3 requests for private compatible stores", () => {
    const config = getSpacesRuntimeConfig({
      env: {
        DO_SPACES_ACCESS_KEY_ID: "access",
        DO_SPACES_BUCKET: "caudals",
        DO_SPACES_ENDPOINT: "http://caudals-object-storage-minio:9000",
        DO_SPACES_FORCE_PATH_STYLE: "true",
        DO_SPACES_REGION: "us-east-1",
        DO_SPACES_SECRET_ACCESS_KEY: "secret",
        NEXT_PUBLIC_DO_SPACES_CDN_URL:
          "http://caudals-object-storage-minio:9000/caudals",
      },
    });

    expect(config.configured).toBe(true);
    expect(config.forcePathStyle).toBe(true);
  });

  it("reads secret-file fallbacks for sensitive values", () => {
    const accessFile = writeTempSecret("access-from-file\n");
    const secretFile = writeTempSecret("secret-from-file\n");

    const config = getSpacesRuntimeConfig({
      env: {
        DO_SPACES_ACCESS_KEY_ID_FILE: accessFile,
        DO_SPACES_BUCKET: "caudals",
        DO_SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.com",
        DO_SPACES_REGION: "nyc3",
        DO_SPACES_SECRET_ACCESS_KEY_FILE: secretFile,
        NEXT_PUBLIC_DO_SPACES_CDN_URL:
          "https://caudals.nyc3.cdn.digitaloceanspaces.com",
      },
    });

    expect(config.configured).toBe(true);
    expect(config.accessKeyId).toBe("access-from-file");
    expect(config.secretAccessKey).toBe("secret-from-file");
  });

  it("lists missing production settings without throwing by default", () => {
    const config = getSpacesRuntimeConfig({ env: {} });

    expect(config.configured).toBe(false);
    expect(config.bucket).toBe("caudals-storage");
    expect(config.missing).toContain("DO_SPACES_ENDPOINT");
    expect(config.missing).toContain("DO_SPACES_SECRET_ACCESS_KEY");
  });

  it("throws when required configuration is missing", () => {
    expect(() =>
      getSpacesRuntimeConfig({ env: {}, requireConfigured: true })
    ).toThrow("DigitalOcean Spaces is not fully configured");
  });
});
