/**
 * EN/ES parity check (`npm run i18n:check-parity`; launch L-23, spec P-45).
 *
 * Every catalogue a person reads from must say the same things in English
 * and Spanish:
 *
 * - the public site (`lib/i18n/messages/*.json`) and the evaluation app
 *   (`lib/evals/messages/{en,es}.ts`),
 * - the emails (`lib/email/copy.ts`),
 * - the report exports: PDF/Word labels (`lib/evals/reports/i18n.ts`), the
 *   executive summary and fixes (`summary-copy.ts`) and the readout
 *   (`readout-copy.ts`), and the invoice wording (`lib/billing/invoicing/copy.ts`),
 * - the legal pages (`content/legal/*.json`) and the help centre
 *   (`content/help/{en,es}/*.md`).
 *
 * For each pair: the same keys, no empty value, the same `{placeholders}`, and
 * no English left in the Spanish catalogue (or the other way round): a
 * Spanish value equal to the English one fails unless it is language-neutral
 * (brand names, units, identifiers; the lint rule's allowlist plus
 * {@link SAME_IN_BOTH}). Labels shown through `tr("…")` or `phrase("…")`
 * must have an entry in the Spanish phrase table.
 *
 * The API's error codes and messages (`scripts/i18n/api-errors.ts`) each need
 * English and Spanish in `lib/evals/messages/api-errors.ts`.
 *
 * Last, it runs the `caudals/no-ui-literals` lint rule (scripts/lint) over
 * the evaluation app, the demo, the email templates and the public site, so a
 * string written straight into a component fails here as well as in
 * `npm run lint`.
 *
 * TypeScript already enforces most key sets at compile time; this script
 * gives the same guarantee to the image build (the general CI workflow is
 * off) and also catches empty, untranslated and mismatched values, which
 * typecheck cannot see. The rendered emails and exports are checked by
 * `tests/i18n/rendered-parity.test.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { en as emailEn, es as emailEs } from "@/lib/email/copy";
import { INVOICE_COPY } from "@/lib/billing/invoicing/copy";
import { messages as appEn } from "@/lib/evals/messages/en";
import { es as appEs } from "@/lib/evals/messages/es";
import { hasPhrase } from "@/lib/evals/messages/phrases";
import { API_CODES, API_ERROR_FALLBACK, API_ERROR_PAGE, API_ERROR_REFERENCE, API_MESSAGES_ES, API_PATTERNS_ES, spanishApiMessage } from "@/lib/evals/messages/api-errors";
import { reportStrings } from "@/lib/evals/reports/i18n";
import { READOUT_COPY } from "@/lib/evals/reports/readout-copy";
import { SUMMARY_COPY } from "@/lib/evals/reports/summary-copy";
import { ESLint } from "eslint";
import { ALLOWED_TERMS, hasProse, termsPattern, UI_LITERAL_DIRS } from "./lint/no-ui-literals.mjs";
import { apiErrorProblems, collectApiErrors } from "./i18n/api-errors";

/**
 * Words spelled the same in English and Spanish, accepted when a value is
 * identical in both catalogues. A real translation never goes here.
 */
const SAME_IN_BOTH = [
  "General", "Plan", "Total", "Sector", "Legal", "Editor", "Roles", "Chat", "Web", "experimental", "Endpoints",
  "Demo", "demo", "Blog", "Newsletter", "Online", "Hash", "Error", "Final", "Normal", "Manual", "Local", "Global",
  "Personal", "Premium", "Standard", "Portal", "Banner", "Cookies", "Marketing", "Software", "Hardware",
  "Fintech", "Insurtech", "Legaltech", "Retail", "Startups", "Scale-ups", "Benchmark", "tokens", "España",
  // Names.
  "Data Unfiltered",
];

/**
 * Keys whose `{braces}` are text for the reader, not slots: the Spanish
 * outreach template writes `{nombre}` where the English one writes `{name}`.
 */
const PLACEHOLDER_EXCEPTIONS = new Set(["app (lib/evals/messages):psOutreachHelp"]);

const pattern = termsPattern([...ALLOWED_TERMS, ...SAME_IN_BOTH]);
const PLACEHOLDER = /\{(\w+)\}/g;

type Tree = { [key: string]: unknown };
type Problem = { catalogue: string; kind: string; items: string[] };
const problems: Problem[] = [];
const summary: string[] = [];

function report(catalogue: string, kind: string, items: string[]) {
  if (items.length) problems.push({ catalogue, kind, items });
}

/** Flattens nested objects and arrays into dotted paths; functions count as present. */
function flatten(tree: unknown, prefix = "", out = new Map<string, string | null>()): Map<string, string | null> {
  if (typeof tree === "string") out.set(prefix, tree);
  else if (typeof tree === "function") out.set(prefix, null);
  else if (Array.isArray(tree)) tree.forEach((value, index) => flatten(value, prefix ? `${prefix}.${index}` : String(index), out));
  else if (tree && typeof tree === "object") {
    for (const [key, value] of Object.entries(tree as Tree)) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  } else if (tree !== undefined && tree !== null) out.set(prefix, null);
  return out;
}

function placeholders(value: string) {
  return [...new Set([...value.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort().join(",");
}

/** Whether a value equal in both languages still has words that need translating. */
function untranslated(value: string) {
  return hasProse(value.replace(PLACEHOLDER, " "), pattern);
}

function comparePair(catalogue: string, english: unknown, spanish: unknown, options: { identical?: boolean } = {}) {
  const source = flatten(english);
  const target = flatten(spanish);
  report(catalogue, "keys missing in Spanish", [...source.keys()].filter((key) => !target.has(key)));
  report(catalogue, "keys only in Spanish", [...target.keys()].filter((key) => !source.has(key)));
  const empty: string[] = [];
  const mismatched: string[] = [];
  const same: string[] = [];
  for (const [key, value] of source) {
    const other = target.get(key);
    if (typeof value !== "string" || typeof other !== "string") continue;
    if (value.trim() === "" || other.trim() === "") empty.push(key);
    else if (placeholders(value) !== placeholders(other) && !PLACEHOLDER_EXCEPTIONS.has(`${catalogue}:${key}`)) mismatched.push(`${key}: {${placeholders(value)}} ≠ {${placeholders(other)}}`);
    else if (options.identical !== false && value === other && untranslated(value)) same.push(`${key}: “${value.slice(0, 70)}”`);
  }
  report(catalogue, "empty values", empty);
  report(catalogue, "placeholder mismatches", mismatched);
  report(catalogue, "values left untranslated (identical in English and Spanish)", same);
  summary.push(`${catalogue}: ${source.size} keys`);
}

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Tree;

// 1. Catalogues.
comparePair("site (lib/i18n/messages)", readJson("lib/i18n/messages/en.json"), readJson("lib/i18n/messages/es.json"));
comparePair("app (lib/evals/messages)", appEn, appEs);
comparePair("emails (lib/email/copy.ts)", emailEn, emailEs);
comparePair("PDF/Word labels (lib/evals/reports/i18n.ts)", reportStrings("en"), reportStrings("es"));
comparePair("report summary and fixes (summary-copy.ts)", SUMMARY_COPY.en, SUMMARY_COPY.es);
comparePair("readout (readout-copy.ts)", READOUT_COPY.en, READOUT_COPY.es);
comparePair("invoices (lib/billing/invoicing/copy.ts)", INVOICE_COPY.en, INVOICE_COPY.es);
// Legal texts name companies, laws and addresses that stay as written; the
// structure and placeholders must match (lib/legal/documents.test.ts checks
// the content itself).
comparePair("legal pages (content/legal)", readJson("content/legal/en.json"), readJson("content/legal/es.json"), { identical: false });

// 2. Help centre: the same articles with the same front matter in both languages.
{
  const dir = "content/help";
  const slugs = (locale: string) => readdirSync(path.join(dir, locale)).filter((name) => name.endsWith(".md")).sort();
  const english = slugs("en");
  const spanish = slugs("es");
  report("help centre (content/help)", "articles missing in Spanish", english.filter((name) => !spanish.includes(name)));
  report("help centre (content/help)", "articles only in Spanish", spanish.filter((name) => !english.includes(name)));
  const frontMatter = (locale: string, name: string) => {
    const match = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path.join(dir, locale, name), "utf8"));
    return (match?.[1] ?? "").split("\n").map((line) => /^(\w+):/.exec(line)?.[1]).filter(Boolean).sort().join(",");
  };
  report(
    "help centre (content/help)",
    "front matter differs",
    english.filter((name) => spanish.includes(name) && frontMatter("en", name) !== frontMatter("es", name)),
  );
  summary.push(`help centre (content/help): ${english.length} articles`);
}

// 3. Fixed labels shown through tr("…") / phrase("…") need a Spanish entry.
{
  const ROOTS = ["components", "lib", "app"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  ROOTS.forEach(walk);

  const literals = (node: ts.Expression | undefined): string[] => {
    if (!node) return [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue), ...literals(node.whenFalse)];
    if (ts.isParenthesizedExpression(node)) return literals(node.expression);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
      return [...literals(node.left), ...literals(node.right)];
    }
    return [];
  };

  const missing = new Set<string>();
  let calls = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // Only files that import the phrase helpers (a JSX <tr> is not a call).
    if (!/\b(tr|phrase)\b[^;]*from\s+["'][^"']*messages\/phrases["']/.test(text) && !file.endsWith(path.join("messages", "phrases.ts"))) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "tr" || node.expression.text === "phrase")) {
        for (const literal of literals(node.arguments[0])) {
          calls++;
          if (!hasPhrase(literal) && untranslated(literal)) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart());
            missing.add(`“${literal}” (${file}:${line + 1})`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  report("phrase table (lib/evals/messages/phrases.ts)", "labels passed to tr()/phrase() without a Spanish entry", [...missing]);
  summary.push(`phrase table: ${calls} fixed labels`);
}

// 4. API errors (launch L-23b): every code and sentence the server can send
// has a message in both languages; the app shows the Spanish one.
{
  const inventory = collectApiErrors();
  const catalogue = { spanish: (message: string) => spanishApiMessage(message), patterns: API_PATTERNS_ES, codes: API_CODES, owned: API_MESSAGES_ES };
  for (const { kind, items } of apiErrorProblems(inventory, catalogue)) report("API errors (lib/evals/messages/api-errors.ts)", kind, items);
  const side = (locale: "en" | "es") => ({
    codes: Object.fromEntries(Object.entries(API_CODES).map(([code, text]) => [code, text[locale]])),
    fallback: API_ERROR_FALLBACK[locale], page: API_ERROR_PAGE[locale], reference: API_ERROR_REFERENCE[locale],
  });
  comparePair("API error messages (lib/evals/messages/api-errors.ts)", side("en"), side("es"));
  summary.push(`API errors: ${inventory.codes.size} codes, ${inventory.messages.size} messages, ${inventory.patterns.size} patterns from ${inventory.files} files`);
}

async function main() {
  // 5. No text in the app, the demo, the email templates or the public site
  // bypasses the catalogues (the lint rule, without the rest of `npm run lint`).
  {
    const eslint = new ESLint({ overrideConfigFile: "scripts/lint/ui-literals.config.mjs" });
    const results = await eslint.lintFiles(UI_LITERAL_DIRS);
    const literals = results.flatMap((result) => result.messages
      .filter((message) => message.ruleId === "caudals/no-ui-literals" || message.fatal)
      .map((message) => `${path.relative(process.cwd(), result.filePath)}:${message.line} ${message.message.split(" is not translated")[0]}`));
    report("source (caudals/no-ui-literals)", "texts that bypass the catalogues", literals);
    summary.push(`literal rule: ${results.length} files`);
  }

  if (problems.length) {
    for (const { catalogue, kind, items } of problems) {
      console.error(`✗ ${catalogue}: ${items.length} ${kind}`);
      for (const item of items.slice(0, 25)) console.error(`  - ${item}`);
      if (items.length > 25) console.error(`  … and ${items.length - 25} more`);
    }
    console.error("\nEvery string a person reads needs both languages. Add the missing translation, or, for a name, unit or identifier that reads the same in both, extend the allowlist in scripts/lint/no-ui-literals.mjs.");
    process.exit(1);
  }

  console.log(`i18n parity OK (en, es)\n${summary.map((line) => `  ${line}`).join("\n")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
