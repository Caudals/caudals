import { readFileSync } from "node:fs";

type EnvMap = Record<string, string | undefined>;

type SecretEnvOptions = {
  emptyFileMessage?: string;
  env?: EnvMap;
  missingMessage?: string;
};

export function getSecretEnvValue(
  name: string,
  {
    emptyFileMessage = `${name}_FILE did not contain a value`,
    env = process.env,
    missingMessage,
  }: SecretEnvOptions = {}
) {
  const directValue = env[name]?.trim();
  if (directValue) {
    return directValue;
  }

  const fileEnvName = `${name}_FILE`;
  const filePath = env[fileEnvName]?.trim();
  if (!filePath) {
    if (missingMessage) {
      throw new Error(missingMessage);
    }

    return undefined;
  }

  let fileValue: string;
  try {
    fileValue = readFileSync(filePath, "utf8").trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to read ${fileEnvName}: ${message}`);
  }

  if (!fileValue) {
    throw new Error(emptyFileMessage);
  }

  return fileValue;
}
