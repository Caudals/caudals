import { readFileSync } from "node:fs";

type DatabaseUrlEnv = Record<string, string | undefined>;

type DatabaseUrlOptions = {
  env?: DatabaseUrlEnv;
  missingMessage?: string;
};

const DEFAULT_MISSING_MESSAGE =
  "DATABASE_URL or DATABASE_URL_FILE is required for PostgreSQL access";

export function getDatabaseUrlFromEnv({
  env = process.env,
  missingMessage = DEFAULT_MISSING_MESSAGE,
}: DatabaseUrlOptions = {}) {
  const directValue = env.DATABASE_URL?.trim();
  if (directValue) {
    return directValue;
  }

  const filePath = env.DATABASE_URL_FILE?.trim();
  if (!filePath) {
    throw new Error(missingMessage);
  }

  let fileValue: string;
  try {
    fileValue = readFileSync(filePath, "utf8").trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to read DATABASE_URL_FILE: ${message}`);
  }

  if (!fileValue) {
    throw new Error("DATABASE_URL_FILE did not contain a database URL");
  }

  return fileValue;
}
