import { readFileSync } from "node:fs";

type Dictionary = Record<string, string>;

const sourcePath = "translations-source.json";
const dictionaryPaths = ["translations-es.json", "lib/i18n/es.json"] as const;
const strictOrphans = process.argv.includes("--strict-orphans");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function formatSample(values: string[]) {
  return values.slice(0, 10).map((value) => `  - ${value}`).join("\n");
}

const source = readJson<string[]>(sourcePath);
const sourceSet = new Set(source);
const duplicateSourceKeys = source.filter(
  (key, index) => source.indexOf(key) !== index
);
let failed = false;

if (duplicateSourceKeys.length > 0) {
  failed = true;
  console.error(
    `${sourcePath} has duplicate keys:\n${formatSample(duplicateSourceKeys)}`
  );
}

for (const path of dictionaryPaths) {
  const dictionary = readJson<Dictionary>(path);
  const dictionaryKeys = Object.keys(dictionary);
  const missing = source.filter((key) => !(key in dictionary));
  const empty = source.filter((key) => dictionary[key]?.trim() === "");
  const orphans = dictionaryKeys.filter((key) => !sourceSet.has(key));

  if (missing.length > 0) {
    failed = true;
    console.error(`${path} is missing ${missing.length} source keys:`);
    console.error(formatSample(missing));
  }

  if (empty.length > 0) {
    failed = true;
    console.error(`${path} has ${empty.length} empty translations:`);
    console.error(formatSample(empty));
  }

  if (strictOrphans && orphans.length > 0) {
    failed = true;
    console.error(`${path} has ${orphans.length} orphan translations:`);
    console.error(formatSample(orphans));
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `i18n parity ok: ${source.length} source keys covered by ${dictionaryPaths.join(", ")}`
);
