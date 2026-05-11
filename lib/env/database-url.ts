import { getSecretEnvValue } from "@/lib/env/secrets";

type DatabaseUrlOptions = {
  env?: Record<string, string | undefined>;
  missingMessage?: string;
};

const DEFAULT_MISSING_MESSAGE =
  "DATABASE_URL or DATABASE_URL_FILE is required for PostgreSQL access";

export function getDatabaseUrlFromEnv({
  env = process.env,
  missingMessage = DEFAULT_MISSING_MESSAGE,
}: DatabaseUrlOptions = {}) {
  const databaseUrl = getSecretEnvValue("DATABASE_URL", {
    emptyFileMessage: "DATABASE_URL_FILE did not contain a database URL",
    env,
    missingMessage,
  });

  if (!databaseUrl) {
    throw new Error(missingMessage);
  }

  return databaseUrl;
}
