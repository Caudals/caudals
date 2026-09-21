/**
 * Verifies that every locale defines exactly the English key set.
 *
 * TypeScript already enforces this at compile time (`es.json satisfies
 * Messages`), but this script gives the same guarantee to CI and to anyone
 * editing the JSON directly, and it also catches values that are present but
 * empty — which typecheck cannot see.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const MESSAGES_DIR = path.join("lib", "i18n", "messages");
const SOURCE_LOCALE = "en";
const TARGET_LOCALES = ["es"];

type MessageTree = { [key: string]: string | MessageTree };

function readMessages(locale: string): MessageTree {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"),
  ) as MessageTree;
}

/** Flattens a nested message tree into dotted paths. */
function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();

  for (const [key, value] of Object.entries(tree)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(dotted, value);
    } else {
      for (const [nested, nestedValue] of flatten(value, dotted)) {
        entries.set(nested, nestedValue);
      }
    }
  }

  return entries;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(value: string): Set<string> {
  return new Set([...value.matchAll(PLACEHOLDER)].map((match) => match[1]));
}

function sample(values: string[]) {
  return values
    .slice(0, 10)
    .map((value) => `  - ${value}`)
    .join("\n");
}

const source = flatten(readMessages(SOURCE_LOCALE));
let failed = false;

for (const locale of TARGET_LOCALES) {
  const target = flatten(readMessages(locale));

  const missing = [...source.keys()].filter((key) => !target.has(key));
  const orphans = [...target.keys()].filter((key) => !source.has(key));
  const empty = [...target.entries()]
    .filter(([, value]) => value.trim() === "")
    .map(([key]) => key);

  // A translation that drops or renames a placeholder renders a literal
  // `{year}` to a visitor, so the slots must match on both sides.
  const placeholderMismatches = [...source.entries()]
    .filter(([key, sourceValue]) => {
      const targetValue = target.get(key);
      if (targetValue === undefined) return false;
      const expected = placeholders(sourceValue);
      const actual = placeholders(targetValue);
      return (
        expected.size !== actual.size ||
        [...expected].some((name) => !actual.has(name))
      );
    })
    .map(([key]) => key);

  for (const [label, values] of [
    [`is missing ${missing.length} keys`, missing],
    [`has ${orphans.length} keys not present in ${SOURCE_LOCALE}`, orphans],
    [`has ${empty.length} empty translations`, empty],
    [
      `has ${placeholderMismatches.length} placeholder mismatches`,
      placeholderMismatches,
    ],
  ] as const) {
    if (values.length > 0) {
      failed = true;
      console.error(`${locale}.json ${label}:`);
      console.error(sample(values));
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `i18n parity OK — ${source.size} keys across ${[SOURCE_LOCALE, ...TARGET_LOCALES].join(", ")}`,
);
