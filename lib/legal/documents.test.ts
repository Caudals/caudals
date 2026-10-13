import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n/config";
import {
  describeEntity,
  ENTITY_TOKEN,
  getLegalContent,
  getLegalDocument,
  resolveLegalDocument,
} from "./documents";
import { renderExport, type AccountantExport } from "@/lib/billing/invoicing/export";
import { getLegalEntity } from "./entity";
import {
  findLegalPlaceholders,
  isPlaceholderEntityValue,
  LEGAL_CONTENT_BANNED,
  LEGAL_ENTITY_PLACEHOLDERS,
} from "./placeholders";
import {
  ACCEPTABLE_DOCUMENTS,
  LEGAL_DOCUMENT_IDS,
  LEGAL_DOCUMENT_PATHS,
  LEGAL_DOCUMENT_VERSIONS,
  signupAcceptance,
} from "./versions";

const CONTENT_DIR = path.join(process.cwd(), "content", "legal");

function contentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? contentFiles(full) : [full];
  });
}

/** Every string in a JSON value, with its path, for line-precise failures. */
function strings(value: unknown, at = ""): [string, string][] {
  if (typeof value === "string") return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${at}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => strings(item, at ? `${at}.${key}` : key));
  }
  return [];
}

/** The shape of a value: keys, array lengths and types, without the words. */
function shape(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  }
  return typeof value;
}

describe("legal content files (CI placeholder check, launch spec §3.2)", () => {
  const files = contentFiles(CONTENT_DIR);

  it("exist", () => {
    expect(files.map((file) => path.basename(file)).sort()).toEqual(["en.json", "es.json"]);
  });

  for (const file of files) {
    it(`${path.relative(process.cwd(), file)} has no placeholder or fictitious company data`, () => {
      const raw = readFileSync(file, "utf8");
      const found = strings(JSON.parse(raw))
        .map(([at, text]) => [at, findLegalPlaceholders(text)] as const)
        .filter(([, hits]) => hits.length > 0);
      expect(found).toEqual([]);
    });

    it(`${path.relative(process.cwd(), file)} makes no certification or compliance claims`, () => {
      const claims = strings(JSON.parse(readFileSync(file, "utf8"))).filter(([, text]) =>
        /\b(certif(y|ied|ies)|compliant|AI Act compliant|certificad[oa]s?|certifica(mos)?|homologad[oa]s?)\b/i.test(text),
      );
      expect(claims).toEqual([]);
    });

    it(`${path.relative(process.cwd(), file)} has no leftover marketplace concepts`, () => {
      const marketplace = strings(JSON.parse(readFileSync(file, "utf8"))).filter(([, text]) =>
        /\b(buyers?|suppliers?|payouts?|compradores?|marketplace|dataset workflow|flujos de trabajo de conjuntos de datos)\b/i.test(text),
      );
      expect(marketplace).toEqual([]);
    });
  }

  it("the placeholder check catches bracketed fill-ins and every §3.2 value", () => {
    expect(findLegalPlaceholders("Operated by Caudals ([legal company name]), tax ID [NIF/CIF].")).toContain(
      "[legal company name]",
    );
    for (const value of [...LEGAL_ENTITY_PLACEHOLDERS, "Caudals, S.L."]) {
      expect(findLegalPlaceholders(`Registered: ${value}.`)).not.toEqual([]);
    }
    expect(findLegalPlaceholders("Contact: hello@caudals.com.")).toEqual([]);
  });

  it("rejects placeholder values supplied at runtime", () => {
    expect(isPlaceholderEntityValue("B00000000")).toBe(true);
    expect(isPlaceholderEntityValue("Calle Ejemplo 1, 47001 Valladolid, España")).toBe(true);
    expect(isPlaceholderEntityValue("Registro Mercantil de Valladolid, Tomo 0000, Folio 0, Hoja VA-00000")).toBe(true);
    expect(isPlaceholderEntityValue("[registered address]")).toBe(true);
    expect(isPlaceholderEntityValue("B12345678")).toBe(false);
  });
});

describe("legal documents", () => {
  it("every document has content, a version and a page path in both locales", () => {
    for (const locale of locales) {
      for (const id of LEGAL_DOCUMENT_IDS) {
        const document = getLegalDocument(id, locale);
        expect(document.title, `${locale}.${id}`).toBeTruthy();
        expect(document.description.length, `${locale}.${id}`).toBeGreaterThan(40);
        expect(document.metaTitle, `${locale}.${id}`).toBeTruthy();
        expect(document.metaDescription.length, `${locale}.${id}`).toBeGreaterThan(60);
        expect(document.sections.length, `${locale}.${id}`).toBeGreaterThan(0);
        for (const section of document.sections) {
          expect(section.id).toMatch(/^[a-z][a-z-]*$/);
          expect(
            (section.body?.length ?? 0) + (section.items?.length ?? 0) + (section.table ? 1 : 0),
            `${locale}.${id}.${section.id}`,
          ).toBeGreaterThan(0);
          for (const [, text] of strings(section)) expect(text.trim(), `${locale}.${id}.${section.id}`).not.toBe("");
        }
        expect(new Set(document.sections.map((section) => section.id)).size).toBe(document.sections.length);
      }
    }
    for (const id of LEGAL_DOCUMENT_IDS) {
      expect(LEGAL_DOCUMENT_VERSIONS[id].version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(LEGAL_DOCUMENT_PATHS[id]).toBe(`/legal/${id}`);
    }
  });

  it("English and Spanish have the same structure (EN/ES parity)", () => {
    expect(shape(getLegalContent("es"))).toEqual(shape(getLegalContent("en")));
    // Section anchors and link targets are not translated.
    for (const id of LEGAL_DOCUMENT_IDS) {
      const en = getLegalDocument(id, "en").sections;
      const es = getLegalDocument(id, "es").sections;
      expect(es.map((section) => section.id)).toEqual(en.map((section) => section.id));
      expect(es.map((section) => section.links?.map((link) => link.href))).toEqual(
        en.map((section) => section.links?.map((link) => link.href)),
      );
    }
  });

  it("links only to legal pages that exist", () => {
    const pages = new Set(Object.values(LEGAL_DOCUMENT_PATHS));
    for (const locale of locales) {
      for (const id of LEGAL_DOCUMENT_IDS) {
        for (const section of getLegalDocument(id, locale).sections) {
          for (const link of section.links ?? []) expect(pages.has(link.href), link.href).toBe(true);
        }
      }
    }
  });

  it("covers what the launch spec requires (P-41)", () => {
    const text = (id: (typeof LEGAL_DOCUMENT_IDS)[number]) =>
      strings(getLegalDocument(id, "en")).map(([, value]) => value).join("\n");
    const terms = text("terms");
    for (const required of [/consumers/, /24 months/, /30 days/, /end of the calendar month/, /within 14 days/, /written authorization/, /ordinary questions/, /Spanish law/, /€0.01/]) {
      expect(terms).toMatch(required);
    }
    const privacy = text("privacy");
    for (const required of [/seven days/, /sub-processors/, /standard contractual clauses/, /privacy@caudals.com/, /aepd/, /commercial AI model provider/]) {
      expect(privacy).toMatch(required);
    }
    expect(text("security")).not.toMatch(/\bcertified\b/);
    expect(getLegalDocument("dpa", "en").sections.some((section) => section.download)).toBe(true);
    expect(getLegalDocument("subprocessors", "en").sections.some((section) => section.table)).toBe(true);
  });

  it("the sub-processor table rows match the column count", () => {
    for (const locale of locales) {
      const table = getLegalDocument("subprocessors", locale).sections.find((section) => section.table)?.table;
      expect(table?.rows.length).toBeGreaterThan(5);
      for (const row of table?.rows ?? []) expect(row).toHaveLength(table!.columns.length);
    }
  });

  it("uses `{…}` slots only in the company sentences", () => {
    for (const locale of locales) {
      const content = getLegalContent(locale);
      const slotted = strings(content).filter(([, text]) => /\{[a-z]+\}/.test(text));
      expect(slotted.map(([at]) => at).sort()).toEqual([
        "dpaTemplate.processorRegistered",
        "notice.entity.registered",
        "notice.entity.registry",
        "notice.sections[0].body[0]",
      ]);
      expect(content.notice.sections[0].body?.[0]).toBe(ENTITY_TOKEN);
    }
  });
});

describe("legal notice company data (decision I-1)", () => {
  const entity = {
    name: "Ejemplo Real, S.L.",
    nif: "B12345678",
    address: "Calle Mayor 2, 47002 Valladolid, España",
    registry: "Registro Mercantil de Valladolid, tomo 1, folio 2, hoja VA-12345",
  };

  it("names the trade name and promises the details when they are not set", () => {
    for (const locale of locales) {
      const notice = resolveLegalDocument("notice", locale, null);
      const owner = notice.sections[0].body!.join(" ");
      expect(owner).toContain("Caudals");
      expect(owner).toContain("hello@caudals.com");
      expect(owner).not.toContain(ENTITY_TOKEN);
      expect(findLegalPlaceholders(owner)).toEqual([]);
    }
    expect(describeEntity("en", null)).toMatch(/will be published on this page once its registration is complete/);
    expect(describeEntity("es", null)).toMatch(/se publicarán en esta página cuando finalice su inscripción/);
  });

  it("publishes the company data when it is set", () => {
    const owner = resolveLegalDocument("notice", "es", entity).sections[0].body![0];
    expect(owner).toContain("Ejemplo Real, S.L.");
    expect(owner).toContain("B12345678");
    expect(owner).toContain("Calle Mayor 2");
    expect(owner).toContain("Registro Mercantil de Valladolid");
    expect(describeEntity("en", { ...entity, registry: null })).not.toMatch(/registered in/);
  });

  it("leaves the other documents untouched", () => {
    expect(resolveLegalDocument("terms", "en", entity)).toBe(getLegalDocument("terms", "en"));
  });
});

describe("acceptance versions", () => {
  it("sign-up accepts the current Terms and Privacy versions", () => {
    expect(signupAcceptance()).toEqual([
      { document: "terms", version: LEGAL_DOCUMENT_VERSIONS.terms.version },
      { document: "privacy", version: LEGAL_DOCUMENT_VERSIONS.privacy.version },
    ]);
    expect(ACCEPTABLE_DOCUMENTS).toEqual(["terms", "privacy", "dpa"]);
  });

  it("keeps the launch texts marked as pending legal review (decision I-2)", () => {
    for (const id of ACCEPTABLE_DOCUMENTS) {
      expect(LEGAL_DOCUMENT_VERSIONS[id]).toEqual({ version: "2026-10-11", review: "pending_legal_review" });
    }
  });
});

/**
 * Invoice templates (launch L-13, decision I-1): the code that words invoices,
 * the accountant export and the "invoice available" email must never carry the
 * §3.2 placeholder company data. The issuer comes from LEGAL_ENTITY_* at
 * runtime, and placeholder values there are ignored.
 */
describe("invoice templates (CI placeholder check, launch spec §3.2)", () => {
  const sources = [
    ...readdirSync(path.join(process.cwd(), "lib", "billing", "invoicing"))
      .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
      .map((name) => path.join("lib", "billing", "invoicing", name)),
    path.join("scripts", "billing", "monthly-export.ts"),
    path.join("lib", "email", "copy.ts"),
    path.join("lib", "email", "templates.tsx"),
  ];

  it("cover the invoicing module, the export and the invoice email", () => {
    expect(sources.map((file) => path.basename(file))).toEqual(expect.arrayContaining(["index.ts", "manual.ts", "copy.ts", "export.ts", "monthly-export.ts", "templates.tsx"]));
  });

  for (const file of sources) {
    it(`${file} has no placeholder company data`, () => {
      const text = readFileSync(path.join(process.cwd(), file), "utf8").toLowerCase();
      expect(LEGAL_CONTENT_BANNED.filter((value) => text.includes(value.toLowerCase()))).toEqual([]);
    });
  }

  it("the accountant export never shows placeholder data as the issuer", () => {
    const placeholders = {
      LEGAL_ENTITY_NAME: "Caudals, S.L.",
      LEGAL_ENTITY_NIF: "B00000000",
      LEGAL_ENTITY_ADDRESS: "Calle Ejemplo 1, 47001 Valladolid, España",
      LEGAL_ENTITY_REGISTRY: "Registro Mercantil de Valladolid, Tomo 0000, Folio 0, Hoja VA-00000",
    };
    const data: AccountantExport = {
      month: "2026-10", livemode: true, time_zone: "Europe/Madrid", from: "2026-09-30T22:00:00Z", to: "2026-10-31T23:00:00Z",
      generated_at: "2026-11-01T08:00:00Z", complete: true, sales: [], refunds: [], chargebacks: [], purchased_credits: {}, free_credits: {},
      orders: [], documents: [], checks: { paid_orders_without_invoice: 0 },
    };
    const files = renderExport(data, { issuer: getLegalEntity(placeholders) });
    for (const content of Object.values(files)) expect(findLegalPlaceholders(content)).toEqual([]);
    expect(files["summary.md"]).toContain("not configured yet");
  });
});
