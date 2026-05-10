import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";

const tempDirs: string[] = [];

function writeTempSecret(value: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-db-url-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "database-url");
  writeFileSync(filePath, value, "utf8");
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("getDatabaseUrlFromEnv", () => {
  it("prefers DATABASE_URL when present", () => {
    const filePath = writeTempSecret("postgres://from-file\n");

    expect(
      getDatabaseUrlFromEnv({
        env: {
          DATABASE_URL: " postgres://direct ",
          DATABASE_URL_FILE: filePath,
        },
      })
    ).toBe("postgres://direct");
  });

  it("reads DATABASE_URL_FILE when DATABASE_URL is absent", () => {
    const filePath = writeTempSecret("postgres://from-file\n");

    expect(
      getDatabaseUrlFromEnv({
        env: {
          DATABASE_URL_FILE: filePath,
        },
      })
    ).toBe("postgres://from-file");
  });

  it("throws a caller-provided missing message", () => {
    expect(() =>
      getDatabaseUrlFromEnv({
        env: {},
        missingMessage: "target database URL is required",
      })
    ).toThrow("target database URL is required");
  });

  it("rejects an empty DATABASE_URL_FILE", () => {
    const filePath = writeTempSecret("\n");

    expect(() =>
      getDatabaseUrlFromEnv({
        env: {
          DATABASE_URL_FILE: filePath,
        },
      })
    ).toThrow("DATABASE_URL_FILE did not contain a database URL");
  });
});
