import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getSecretEnvValue } from "@/lib/env/secrets";

const tempDirs: string[] = [];

function writeTempSecret(value: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-secret-"));
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

describe("getSecretEnvValue", () => {
  it("prefers direct env values", () => {
    const filePath = writeTempSecret("from-file\n");

    expect(
      getSecretEnvValue("BETTER_AUTH_SECRET", {
        env: {
          BETTER_AUTH_SECRET: " direct ",
          BETTER_AUTH_SECRET_FILE: filePath,
        },
      })
    ).toBe("direct");
  });

  it("reads secret file values", () => {
    const filePath = writeTempSecret("from-file\n");

    expect(
      getSecretEnvValue("BETTER_AUTH_SECRET", {
        env: {
          BETTER_AUTH_SECRET_FILE: filePath,
        },
      })
    ).toBe("from-file");
  });

  it("returns undefined when no value is configured and no message is required", () => {
    expect(getSecretEnvValue("BETTER_AUTH_SECRET", { env: {} })).toBeUndefined();
  });

  it("throws a required missing message", () => {
    expect(() =>
      getSecretEnvValue("BETTER_AUTH_SECRET", {
        env: {},
        missingMessage: "auth secret is required",
      })
    ).toThrow("auth secret is required");
  });
});
