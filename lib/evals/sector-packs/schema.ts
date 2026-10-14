import { z } from "zod";
import { canonicalText } from "../generation/auto-draft";
import { sha256 } from "../contracts/hashing";
import { DOMAIN_PACKS } from "../generation/pack-registry";
import { SECTORS } from "./sectors";

/**
 * Sector pack items and the import file (launch L-25, P-30/P-31).
 *
 * An item is one sector-generic question with the verbatim excerpt of the
 * public or licensed source its expected answer comes from. Rights are
 * recorded per item; customer-owned material is not a valid kind (the
 * database refuses it too).
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Use a real date (YYYY-MM-DD).");
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const RIGHTS_KINDS = ["public_official_text", "public_sector_reuse", "licensed", "caudals_owned"] as const;
export type RightsKind = (typeof RIGHTS_KINDS)[number];

export const packItemSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/, "Use 3–80 lowercase letters, digits and hyphens."),
  topic: text(1, 80),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  question: text(8, 2000),
  questionEn: text(3, 2000).optional(),
  expected: text(1, 4000),
  keyFacts: z.array(text(1, 500)).min(1).max(6),
  severity: z.enum(["low", "medium", "high", "critical"]),
  difficulty: z.enum(["routine", "advanced", "challenge"]),
  answerability: z.enum(["answerable", "missing_information", "unanswerable", "must_abstain"]).default("answerable"),
  source: z.strictObject({
    url: z.url().max(2000).refine((value) => value.startsWith("https://"), "Cite an https source."),
    // Official titles of Spanish laws can run past 300 characters.
    title: text(1, 500),
    publisher: text(1, 200),
    locator: text(1, 200),
    excerpt: text(20, 1500),
    retrievedAt: isoDate,
    asOf: isoDate.optional(),
  }),
  rights: z.strictObject({
    kind: z.enum(RIGHTS_KINDS),
    basis: text(20, 1000),
    licenceRef: text(1, 300).optional(),
  }),
  authorNote: z.string().trim().max(500).optional(),
});
export type PackItemInput = z.infer<typeof packItemSchema>;

export const packMetaSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  sector: z.enum(SECTORS),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  domainPackId: z.string().refine((value) => DOMAIN_PACKS.some((pack) => pack.id === value && pack.status === "active"), "Use an active domain pack."),
  title: z.strictObject({ en: text(1, 200), es: text(1, 200) }),
  summary: z.strictObject({ en: text(1, 600), es: text(1, 600) }),
});

export const packFileSchema = z.strictObject({
  schema: z.literal("caudals.sector-pack/v1"),
  pack: packMetaSchema,
  version: z.strictObject({ notes: z.string().trim().max(2000).default("") }).default({ notes: "" }),
  items: z.array(z.unknown()).min(1).max(500),
});
export type PackFile = z.infer<typeof packFileSchema>;

/**
 * The deduplication key of a question: the same normalization as generated
 * question families (case, accents width, punctuation and numbers folded).
 */
export function questionFingerprint(question: string) {
  return sha256(
    canonicalText(question)
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .replace(/\b\d+(?:[.,]\d+)?\b/g, "#")
      .replace(/[^\p{L}#]+/gu, " ")
      .trim(),
  );
}

export type ItemProblem = { index: number; key: string | null; message: string };

/**
 * Checks an item beyond its shape: the key facts are spans of the excerpt, the
 * source was not read in the future, and a licence names its reference.
 */
export function itemProblems(item: PackItemInput, today = new Date().toISOString().slice(0, 10)): string[] {
  const problems: string[] = [];
  const excerpt = canonicalText(item.source.excerpt);
  for (const fact of item.keyFacts) if (!excerpt.includes(canonicalText(fact))) problems.push(`Key fact not in the excerpt: ${fact.slice(0, 80)}`);
  if (item.source.retrievedAt > today) problems.push("The source cannot be retrieved in the future.");
  if (item.source.asOf && item.source.asOf > today) problems.push("The as-of date is in the future.");
  if (item.rights.kind === "licensed" && !item.rights.licenceRef) problems.push("A licensed source needs its licence reference.");
  return problems;
}

/**
 * Validates an import file: every item's shape and checks, unique keys and
 * no duplicate questions. Returns the parsed items or every problem found.
 */
export function validatePackFile(raw: unknown, today?: string): { file: PackFile; items: PackItemInput[]; problems: ItemProblem[] } {
  const file = packFileSchema.parse(raw);
  const items: PackItemInput[] = [];
  const problems: ItemProblem[] = [];
  const keys = new Set<string>();
  const prints = new Map<string, string>();
  for (const [index, value] of file.items.entries()) {
    const parsed = packItemSchema.safeParse(value);
    const key = typeof (value as { key?: unknown })?.key === "string" ? (value as { key: string }).key : null;
    if (!parsed.success) {
      problems.push({ index: index + 1, key, message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "item"}: ${issue.message}`).join("; ") });
      continue;
    }
    const item = { ...parsed.data, language: parsed.data.language ?? file.pack.language };
    for (const message of itemProblems(item, today)) problems.push({ index: index + 1, key: item.key, message });
    if (keys.has(item.key)) problems.push({ index: index + 1, key: item.key, message: "Duplicate key." });
    keys.add(item.key);
    const print = questionFingerprint(item.question);
    const twin = prints.get(print);
    if (twin) problems.push({ index: index + 1, key: item.key, message: `Same question as ${twin}.` });
    else prints.set(print, item.key);
    items.push(item);
  }
  return { file, items, problems };
}
