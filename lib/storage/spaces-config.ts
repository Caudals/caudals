import { S3Client } from "@aws-sdk/client-s3";

import { getSecretEnvValue } from "@/lib/env/secrets";

type EnvMap = Record<string, string | undefined>;

export type SpacesRuntimeConfig = {
  accessKeyId?: string;
  bucket: string;
  cdnUrl: string;
  configured: boolean;
  endpoint?: string;
  forcePathStyle: boolean;
  missing: string[];
  region?: string;
  secretAccessKey?: string;
};

type SpacesConfigOptions = {
  env?: EnvMap;
  requireConfigured?: boolean;
};

const DEFAULT_BUCKET = "caudals-storage";
const REQUIRED_CONFIG_NAMES = [
  "DO_SPACES_ENDPOINT",
  "DO_SPACES_REGION",
  "DO_SPACES_BUCKET",
  "DO_SPACES_ACCESS_KEY_ID",
  "DO_SPACES_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_DO_SPACES_CDN_URL",
] as const;

function readBooleanConfigValue(name: string, env: EnvMap) {
  const value = env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function readConfigValue(name: string, env: EnvMap) {
  return getSecretEnvValue(name, {
    emptyFileMessage: `${name}_FILE did not contain a value`,
    env,
  });
}

export function getSpacesRuntimeConfig({
  env = process.env,
  requireConfigured = false,
}: SpacesConfigOptions = {}): SpacesRuntimeConfig {
  const endpoint = readConfigValue("DO_SPACES_ENDPOINT", env);
  const region = readConfigValue("DO_SPACES_REGION", env);
  const bucket = readConfigValue("DO_SPACES_BUCKET", env);
  const accessKeyId = readConfigValue("DO_SPACES_ACCESS_KEY_ID", env);
  const secretAccessKey = readConfigValue("DO_SPACES_SECRET_ACCESS_KEY", env);
  const cdnUrl = readConfigValue("NEXT_PUBLIC_DO_SPACES_CDN_URL", env);
  const forcePathStyle = readBooleanConfigValue(
    "DO_SPACES_FORCE_PATH_STYLE",
    env
  );

  const values: Record<(typeof REQUIRED_CONFIG_NAMES)[number], string | undefined> = {
    DO_SPACES_ACCESS_KEY_ID: accessKeyId,
    DO_SPACES_BUCKET: bucket,
    DO_SPACES_ENDPOINT: endpoint,
    DO_SPACES_REGION: region,
    DO_SPACES_SECRET_ACCESS_KEY: secretAccessKey,
    NEXT_PUBLIC_DO_SPACES_CDN_URL: cdnUrl,
  };
  const missing = REQUIRED_CONFIG_NAMES.filter((name) => !values[name]);
  const configured = missing.length === 0;

  if (requireConfigured && !configured) {
    throw new Error(
      `DigitalOcean Spaces is not fully configured. Missing: ${missing.join(", ")}`
    );
  }

  return {
    accessKeyId,
    bucket: bucket ?? DEFAULT_BUCKET,
    cdnUrl: cdnUrl ?? "",
    configured,
    endpoint,
    forcePathStyle,
    missing,
    region,
    secretAccessKey,
  };
}

export function createSpacesClient(options: SpacesConfigOptions = {}) {
  const config = getSpacesRuntimeConfig(options);

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId ?? "",
      secretAccessKey: config.secretAccessKey ?? "",
    },
    forcePathStyle: config.forcePathStyle,
  });
}
