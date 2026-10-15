/**
 * API errors in both languages (launch L-23b, spec P-45, §1 criterion 6):
 * every code and sentence the server can send has English and Spanish, and
 * what the app shows a Spanish reader is never an English sentence.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiErrorProblems, collectApiErrors, DYNAMIC_SITES } from "@/scripts/i18n/api-errors";
import { API_CODES, API_MESSAGES_ES, API_PATTERNS_ES, apiErrorText, spanishApiMessage } from "@/lib/evals/messages/api-errors";

const inventory = collectApiErrors();
const catalogue = { spanish: (message: string) => spanishApiMessage(message), patterns: API_PATTERNS_ES, codes: API_CODES, owned: API_MESSAGES_ES };

describe("API error inventory", () => {
  it("finds the codes, sentences and patterns the server sends", () => {
    expect(inventory.codes.size).toBeGreaterThan(100);
    expect(inventory.messages.size).toBeGreaterThan(400);
    // Literals, defaults, message tables, destructured tuples, helpers and subclasses.
    for (const code of ["INPUT_INVALID", "SCOPE_DENIED", "CREDITS_EXHAUSTED", "CAP_REACHED", "PLAN_LIMIT_RUNS", "TAX_ID_INVALID", "PRICE_BOOK_IMMUTABLE", "LOGO_TYPE", "WORK_EMAIL_REQUIRED", "SIGNUP_DOMAIN_TAKEN", "CONNECTION_UNSUPPORTED", "EVIDENCE_ERROR", "RATE_LIMITED"]) {
      expect(inventory.codes.has(code), code).toBe(true);
    }
    for (const message of [
      "This action is not available.",
      "Enter a valid work email.",
      "Check the tax ID: a Spanish NIF, an EU VAT number or your company's tax registration number.",
      "Scheduled and active revisions cannot be edited. Draft a new revision instead.",
      "Evidence not found",
      "This workspace has used its plan's runs for this month.",
      "Use a PNG or JPEG image.",
      "say what should change",
    ]) expect(inventory.messages.has(message), message).toBe(true);
    expect(inventory.patterns.has("Not enough credits for this run. Add {} credits to continue.")).toBe(true);
    expect(inventory.patterns.has("Too many requests for this token. Try again in {} seconds.")).toBe(true);
  });

  it("has English and Spanish for every code and sentence the API can send", () => {
    const problems = apiErrorProblems(inventory, catalogue);
    expect(problems.map(({ kind, items }) => `${kind}:\n  ${items.join("\n  ")}`).join("\n")).toBe("");
  });

  it("reviews every message built at run time", () => {
    expect([...inventory.dynamic.keys()].sort()).toEqual(Object.keys(DYNAMIC_SITES).sort());
  });
});

describe("apiErrorText", () => {
  it("shows the server's sentence in English and its translation in Spanish", () => {
    expect(apiErrorText("INPUT_INVALID", "Enter a valid work email.", "en")).toBe("Enter a valid work email.");
    expect(apiErrorText("INPUT_INVALID", "Enter a valid work email.", "es")).toBe("Escribe un correo de trabajo válido.");
    // The older curated table (phrases.ts) still counts.
    expect(apiErrorText("CHECKOUT_CLOSED", "This checkout has ended. Start a new top-up.", "es")).toBe("Este pago ha terminado. Empieza una nueva recarga.");
  });

  it("fills the run-time parts of a pattern, with Spanish number formatting", () => {
    expect(apiErrorText("CREDITS_EXHAUSTED", "Not enough credits for this run. Add 12000 credits to continue.", "es"))
      .toBe("No hay créditos suficientes para esta ejecución. Añade 12.000 créditos para continuar.");
    expect(apiErrorText("CAP_REACHED", "This run would pass the per-run credit limit of 500 credits. An owner can raise it in Settings → Billing and usage.", "es"))
      .toBe("Esta ejecución superaría el límite de 500 créditos por ejecución. Un propietario puede ampliarlo en Ajustes → Facturación y uso.");
    expect(apiErrorText("INPUT_INVALID", "The evaluation “Soporte web” uses this test set. Delete that evaluation first.", "es"))
      .toBe("La evaluación «Soporte web» usa este conjunto de pruebas. Elimina antes esa evaluación.");
    expect(apiErrorText("INPUT_INVALID", "Check the sheet: row 3: veredicto_invalid, motivo_required.", "es"))
      .toBe("Revisa la hoja: fila 3: veredicto_invalid, motivo_required.");
  });

  it("translates sentences joined into one message, and quotes a model provider's own words", () => {
    expect(apiErrorText("INPUT_INVALID", "The source cannot be retrieved in the future. Duplicate key.", "es"))
      .toBe("La fuente no puede tener una fecha de consulta futura. Clave duplicada.");
    expect(apiErrorText("PROVIDER_UNAVAILABLE", "The provider rejected the key. Invalid API key", "es"))
      .toBe("El proveedor ha rechazado la clave. Respuesta del proveedor: «Invalid API key»");
  });

  it("falls back to the code's message, then to a generic message with the code, never to English", () => {
    expect(apiErrorText("VERSION_CONFLICT", "A sentence added later without Spanish.", "es")).toBe(API_CODES.VERSION_CONFLICT.es);
    expect(apiErrorText("CREDITS_EXHAUSTED", undefined, "es")).toBe(API_CODES.CREDITS_EXHAUSTED.es);
    const unknown = apiErrorText("SOMETHING_NEW", "Something new happened.", "es");
    expect(unknown).toContain("SOMETHING_NEW");
    expect(unknown).not.toContain("Something new happened");
    expect(apiErrorText("SOMETHING_NEW", "", "en")).toContain("SOMETHING_NEW");
    // Object prototype names are not translations.
    expect(apiErrorText("constructor", "toString", "es")).toContain("(código constructor)");
  });
});

/**
 * The public demo's API answers lowercase codes only (`{ error: { code } }`);
 * the demo page shows `demo.errors.<code>` from the site catalogue, or
 * `demo.errors.generic`. These codes are never shown as such: they are
 * internal, or the page shows its own text for them.
 */
const DEMO_GENERIC = new Set([
  "consent_required", // the share and notify forms show their own consent text
  "not_ready", "rate_limited", "response_interrupted", "response_too_large", "response_unreadable", "target_not_json", "too_many_redirects",
]);

describe("public demo error codes", () => {
  it("each code has its message in both site catalogues, or is listed as generic", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk("lib/demo");
    walk("app/(app)/api/demo");
    const codes = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/new (?:TargetInputError|WebError|LimitError)\("([a-z_]+)"\)|failure\("([a-z_]+)"|(?:code|error): "([a-z_]+)"/g)) codes.add(match[1] ?? match[2] ?? match[3]);
    }
    expect(codes.size).toBeGreaterThan(30);
    const en = JSON.parse(readFileSync("lib/i18n/messages/en.json", "utf8")).demo.errors as Record<string, string>;
    const es = JSON.parse(readFileSync("lib/i18n/messages/es.json", "utf8")).demo.errors as Record<string, string>;
    expect(en.generic && es.generic).toBeTruthy();
    const missing = [...codes].filter((code) => !DEMO_GENERIC.has(code) && !(en[code] && es[code]));
    expect(missing).toEqual([]);
    expect([...DEMO_GENERIC].filter((code) => !codes.has(code) || en[code])).toEqual([]);
  });
});
