import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sourceSchema, type Source } from "../../lib/evals/contracts/cases";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { messages } from "../../lib/evals/messages/en";
import { es } from "../../lib/evals/messages/es";
import { packItemSchema, questionFingerprint, validatePackFile } from "../../lib/evals/sector-packs/schema";
import { SECTORS, SECTOR_LABELS } from "../../lib/evals/sector-packs/sectors";
import { sectorPacksEnabled, SECTOR_PACK_MIN_PUBLISHED_ITEMS } from "../../lib/evals/sector-packs/flags";
import { diffPages, periodOf, sourcePages } from "../../lib/evals/sector-packs/refresh";

const seeds = ["content/sector-packs/es-fiscal-contable-laboral.json", "content/sector-packs/es-seguros.json"];
const seed = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { pack: { id: string; sector: string }; items: Array<Record<string, unknown>> };

describe("sector pack seed files (launch L-25)", () => {
  it.each(seeds)("%s validates: shape, key facts in excerpts, unique keys and questions, public rights", (path) => {
    const { file, items, problems } = validatePackFile(seed(path), "2026-10-13");
    expect(problems).toEqual([]);
    expect(items.length).toBeGreaterThanOrEqual(SECTOR_PACK_MIN_PUBLISHED_ITEMS);
    expect(["fiscal_accounting_payroll", "insurance"]).toContain(file.pack.sector);
    for (const item of items) {
      expect(["public_official_text", "public_sector_reuse"]).toContain(item.rights.kind);
      expect(item.source.url).toMatch(/^https:\/\/(www\.)?boe\.es\//);
      expect(item.source.retrievedAt).toBe("2026-10-13");
      expect(item.language).toBe("es");
    }
  });
  it("the seed notes say the questions are pending expert review", () => {
    for (const path of seeds) expect(JSON.stringify(seed(path).items).includes("expert_reviewed")).toBe(false);
    for (const path of seeds) expect((JSON.parse(readFileSync(path, "utf8")) as { version: { notes: string } }).version.notes).toMatch(/pending expert review/i);
  });
});

describe("sector pack item validation", () => {
  const base = seed(seeds[0]).items[0];
  const file = (items: unknown[]) => ({ schema: "caudals.sector-pack/v1", pack: seed(seeds[0]).pack, items });
  it("refuses customer-owned rights, plain http sources and unknown fields", () => {
    expect(packItemSchema.safeParse({ ...base, rights: { kind: "customer_owned", basis: "Customer documentation supplied under the DPA." } }).success).toBe(false);
    expect(packItemSchema.safeParse({ ...base, source: { ...(base.source as object), url: "http://example.com/page" } }).success).toBe(false);
    expect(packItemSchema.safeParse({ ...base, orgId: randomUUID() }).success).toBe(false);
  });
  it("names key facts outside the excerpt, duplicate keys, duplicate questions, licences without a reference and future dates", () => {
    const { problems } = validatePackFile(file([
      { ...base, keyFacts: ["no está en el extracto"] },
      { ...base, key: "duplicate-question" },
      { ...base },
      { ...base, key: "licensed-item", question: "¿Una pregunta distinta con licencia?", rights: { kind: "licensed", basis: "Licensed from a publisher under contract." } },
      { ...base, key: "future-item", question: "¿Otra pregunta distinta del futuro?", source: { ...(base.source as object), retrievedAt: "2099-01-01" } },
    ]), "2026-10-13");
    const messages = problems.map((problem) => problem.message).join(" | ");
    expect(messages).toMatch(/Key fact not in the excerpt/);
    expect(messages).toMatch(/Same question as/);
    expect(messages).toMatch(/Duplicate key/);
    expect(messages).toMatch(/licence reference/);
    expect(messages).toMatch(/future/);
  });
  it("folds case, accents, punctuation and numbers in the question fingerprint", () => {
    expect(questionFingerprint("¿Cuál es el tipo general del IVA?")).toBe(questionFingerprint("cual es el TIPO general del iva"));
    expect(questionFingerprint("¿Plazo de 7 días?")).toBe(questionFingerprint("plazo de 15 dias"));
    expect(questionFingerprint("¿Plazo para declarar?")).not.toBe(questionFingerprint("¿Plazo para pagar?"));
  });
});

/** A captured website as the browser reader writes it, cut into anchors of a fixed width. */
function website(pages: Array<[string, string]>, width = 90): Source {
  const markdown = pages.map(([url, text]) => `# ${url.split("/").at(-1)}\n\nSource URL: ${url}\n\n${text}`).join("\n\n---\n\n");
  const anchors = [];
  for (let start = 0; start < markdown.length; start += width) anchors.push({ id: randomUUID(), excerpt: markdown.slice(start, start + width), locator: `utf16:${start}:${Math.min(markdown.length, start + width)}` });
  return sourceSchema.parse(withContentHash({
    schema_version: "1.0", source_id: randomUUID(), revision_id: randomUUID(), title: "Help centre",
    artifact: { path: "sources/website.md", sha256: "0".repeat(64), size_bytes: markdown.length, media_type: "text/markdown", visibility: "internal" },
    anchors, access: { candidate: false, judge: true, customer: true, public: false }, rights: "customer_owned", created_at: new Date().toISOString(), extensions: {},
  }));
}

describe("monthly refresh: changed-page detection", () => {
  const before = website([
    ["https://help.example.com/fees", "The account fee is 5 euros a month. Cards are free."],
    ["https://help.example.com/limits", "Transfers are limited to 10,000 euros a day."],
    ["https://help.example.com/old", "This product was retired."],
  ]);
  it("splits a capture into pages with stable content hashes", () => {
    const pages = sourcePages(before);
    expect(pages.map((page) => page.url)).toEqual(["https://help.example.com/fees", "https://help.example.com/limits", "https://help.example.com/old"]);
    expect(new Set(pages.map((page) => page.hash)).size).toBe(3);
  });
  it("finds new and changed pages, counts removed and unchanged ones, and selects only their excerpts", () => {
    const after = website([
      ["https://help.example.com/fees", "The account fee is 7 euros a month. Cards are free."],
      ["https://help.example.com/limits", "Transfers are limited to 10,000 euros a day."],
      ["https://help.example.com/new", "Instant transfers cost 0.50 euros each."],
    ]);
    const diff = diffPages(before, after);
    expect(diff.newPages).toEqual(["https://help.example.com/new"]);
    expect(diff.changedPages).toEqual(["https://help.example.com/fees"]);
    expect(diff.removed).toBe(1);
    expect(diff.unchanged).toBe(1);
    const excerpts = diff.anchors.map((item) => after.anchors.find((anchor) => anchor.id === item.anchorId)!.excerpt).join("");
    expect(excerpts).toContain("7 euros");
    expect(excerpts).toContain("0.50 euros");
    expect(diff.anchors.every((item) => item.url !== "https://help.example.com/limits" || item.kind)).toBe(true);
    expect(new Set(diff.anchors.map((item) => item.kind))).toEqual(new Set(["new_page", "changed_page"]));
  });
  it("ignores whitespace, case and markup changes, and a different anchor cut", () => {
    const same = website([
      ["https://help.example.com/fees", "The  account fee is 5 euros a month.\n\nCards are **free**."],
      ["https://help.example.com/limits", "Transfers are limited to 10,000 euros a day."],
      ["https://help.example.com/old", "This product was retired."],
    ], 37);
    const diff = diffPages(before, same);
    expect(diff).toMatchObject({ newPages: [], changedPages: [], removed: 0, unchanged: 3, anchors: [] });
  });
  it("names the period by UTC month", () => {
    expect(periodOf(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(periodOf(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });
});

describe("flag and copy", () => {
  it("is off unless SECTOR_PACKS_ENABLED=true", () => {
    expect(sectorPacksEnabled({})).toBe(false);
    expect(sectorPacksEnabled({ SECTOR_PACKS_ENABLED: "1" })).toBe(false);
    expect(sectorPacksEnabled({ SECTOR_PACKS_ENABLED: "true" })).toBe(true);
  });
  it("has Spanish for every L-25 string with the same placeholders, and a label for every sector", () => {
    const keys = (Object.keys(messages) as Array<keyof typeof messages>).filter((key) => /^(sectorPack|sectorPacks|sectorQuestions|monthly|sector[A-Z])/.test(key));
    expect(keys.length).toBeGreaterThan(100);
    const holes = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of keys) {
      expect(es[key], key).toBeTruthy();
      expect(holes(es[key]!), key).toEqual(holes(messages[key]));
    }
    for (const sector of SECTORS) expect(messages[SECTOR_LABELS[sector]]).toBeTruthy();
  });
  it("never claims certification or compliance", () => {
    const copy = Object.entries(messages).filter(([key]) => /^(sectorPack|sectorQuestions|monthly)/.test(key)).map(([, value]) => value).join(" ");
    expect(copy).not.toMatch(/certif|complian|AI Act/i);
  });
});
