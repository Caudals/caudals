import { readFile } from "fs/promises";
import path from "path";

type CheckResult = {
  expectedKeyCount: number;
  actualKeyCount: number;
  missingKeys: string[];
  orphanKeys: string[];
  emptyValues: string[];
};

function uniqueNonEmptyStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

async function loadJson(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function main() {
  const cwd = process.cwd();
  const sourcePath = path.join(cwd, "translations-source.json");
  const localePath = path.join(cwd, "lib", "i18n", "es.json");
  const strictOrphans = process.argv.includes("--strict-orphans");

  const [sourceJson, localeJson] = await Promise.all([
    loadJson(sourcePath),
    loadJson(localePath),
  ]);

  if (!Array.isArray(sourceJson)) {
    throw new Error("translations-source.json must be an array of English source keys");
  }

  if (typeof localeJson !== "object" || localeJson === null || Array.isArray(localeJson)) {
    throw new Error("lib/i18n/es.json must be a JSON object");
  }

  const expectedKeys = uniqueNonEmptyStrings(sourceJson);
  const actualDictionary = localeJson as Record<string, unknown>;
  const actualKeys = Object.keys(actualDictionary);

  const expectedSet = new Set(expectedKeys);
  const actualSet = new Set(actualKeys);

  const missingKeys = expectedKeys.filter((key) => !actualSet.has(key));
  const orphanKeys = actualKeys.filter((key) => !expectedSet.has(key));
  const emptyValues = actualKeys.filter((key) => {
    const value = actualDictionary[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  const result: CheckResult = {
    expectedKeyCount: expectedKeys.length,
    actualKeyCount: actualKeys.length,
    missingKeys,
    orphanKeys,
    emptyValues,
  };

  const preview = {
    expectedKeyCount: result.expectedKeyCount,
    actualKeyCount: result.actualKeyCount,
    missingCount: result.missingKeys.length,
    orphanCount: result.orphanKeys.length,
    emptyValueCount: result.emptyValues.length,
    missingSample: result.missingKeys.slice(0, 10),
    orphanSample: result.orphanKeys.slice(0, 10),
    emptyValueSample: result.emptyValues.slice(0, 10),
  };

  console.info(
    JSON.stringify(
      {
        job: "check-i18n-parity",
        strictOrphans,
        preview,
      },
      null,
      2
    )
  );

  const shouldFail =
    result.missingKeys.length > 0 ||
    result.emptyValues.length > 0 ||
    (strictOrphans && result.orphanKeys.length > 0);

  if (shouldFail) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("check-i18n-parity failed", error);
  process.exit(1);
});
