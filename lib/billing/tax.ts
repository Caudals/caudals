/**
 * IVA treatment for credit top-ups (launch spec v2 §6.14; D-05 businesses
 * only). To be confirmed with the gestor before Gate B.
 *
 * | Customer                                  | Treatment            | Mention                       |
 * | Business in Spain (NIF)                    | 21 % IVA             | —                             |
 * | EU business with a VAT ID valid in VIES    | reverse charge, 0 %  | "Inversión del sujeto pasivo" |
 * | EU business without a valid VIES number    | 21 % IVA             | —                             |
 * | Business outside the EU                    | not subject, 0 %     | "Operación no sujeta"         |
 * | Consumer                                   | refused (D-05)       |                               |
 *
 * VIES is retried on failure; when it stays unavailable the profile waits
 * for manual review (no treatment, so no checkout). Spanish addresses in the
 * Canary Islands, Ceuta and Melilla are outside the IVA territory and also go
 * to manual review.
 */

export type TaxTreatment = "es_vat" | "eu_reverse_charge" | "non_eu_not_subject";
export type TaxIdKind = "es_nif" | "eu_vat" | "non_eu_business";
export type ViesStatus = "not_required" | "valid" | "invalid" | "unavailable";
export type TaxReviewReason = "vies_unavailable" | "es_special_territory";

/** EU member states by ISO country code, with their VAT prefix (Greece uses EL). */
export const EU_VAT_PREFIX: Readonly<Record<string, string>> = Object.freeze({
  AT: "AT", BE: "BE", BG: "BG", CY: "CY", CZ: "CZ", DE: "DE", DK: "DK", EE: "EE", ES: "ES", FI: "FI", FR: "FR", GR: "EL",
  HR: "HR", HU: "HU", IE: "IE", IT: "IT", LT: "LT", LU: "LU", LV: "LV", MT: "MT", NL: "NL", PL: "PL", PT: "PT", RO: "RO",
  SE: "SE", SI: "SI", SK: "SK",
});

export const SPANISH_VAT_RATE_BP = 2100;

export function isEuCountry(country: string) {
  return Object.prototype.hasOwnProperty.call(EU_VAT_PREFIX, country);
}

/** Upper case without spaces, dots, hyphens or slashes. */
export function normalizeTaxId(raw: string) {
  return raw.toUpperCase().replace(/[\s.\-/_]/g, "");
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/**
 * Spanish NIF: a company CIF (letter, 7 digits, control digit or letter), a
 * DNI (8 digits and a letter; sole traders), a NIE (X/Y/Z, 7 digits, letter)
 * or a K/L/M NIF. Checks the control character.
 */
export function isValidSpanishNif(raw: string): boolean {
  const id = normalizeTaxId(raw).replace(/^ES/, "");
  if (/^[0-9]{8}[A-Z]$/.test(id)) return DNI_LETTERS[Number(id.slice(0, 8)) % 23] === id[8];
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(id)) {
    const number = Number(String("XYZ".indexOf(id[0])) + id.slice(1, 8));
    return DNI_LETTERS[number % 23] === id[8];
  }
  if (/^[KLM][0-9]{7}[A-Z]$/.test(id)) return DNI_LETTERS[Number(id.slice(1, 8)) % 23] === id[8];
  if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(id)) {
    const digits = id.slice(1, 8).split("").map(Number);
    let sum = 0;
    digits.forEach((digit, index) => {
      if (index % 2 === 1) sum += digit;
      else { const doubled = digit * 2; sum += Math.floor(doubled / 10) + (doubled % 10); }
    });
    const control = (10 - (sum % 10)) % 10;
    const letter = "JABCDEFGHI"[control];
    const given = id[8];
    if ("PQRSWN".includes(id[0])) return given === letter;
    if ("ABEH".includes(id[0])) return given === String(control);
    return given === String(control) || given === letter;
  }
  return false;
}

export type TaxIdCheck =
  | { ok: true; kind: TaxIdKind; taxId: string; viesCountry?: string; viesNumber?: string }
  | { ok: false; error: "TAX_ID_INVALID" | "COUNTRY_INVALID" };

/**
 * Classifies and normalises a business tax identifier for a country. Spain
 * takes a NIF (an "ES" prefix is dropped); other EU countries take a VAT ID
 * with or without its prefix (stored with it); elsewhere a company or tax
 * registration number.
 */
export function checkTaxId(country: string, raw: string): TaxIdCheck {
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: "COUNTRY_INVALID" };
  const id = normalizeTaxId(raw);
  if (country === "ES") {
    const nif = id.replace(/^ES/, "");
    return isValidSpanishNif(nif) ? { ok: true, kind: "es_nif", taxId: nif } : { ok: false, error: "TAX_ID_INVALID" };
  }
  const prefix = EU_VAT_PREFIX[country];
  if (prefix) {
    const number = id.startsWith(prefix) ? id.slice(prefix.length) : id;
    if (!/^[A-Z0-9]{2,13}$/.test(number)) return { ok: false, error: "TAX_ID_INVALID" };
    return { ok: true, kind: "eu_vat", taxId: `${prefix}${number}`, viesCountry: prefix, viesNumber: number };
  }
  if (!/^[A-Z0-9]{3,30}$/.test(id)) return { ok: false, error: "TAX_ID_INVALID" };
  return { ok: true, kind: "non_eu_business", taxId: id };
}

/** Spanish postcodes outside the IVA territory: Las Palmas (35), Santa Cruz de Tenerife (38), Ceuta (51), Melilla (52). */
export function isSpanishSpecialTerritory(postalCode: string) {
  return /^(35|38|51|52)[0-9]{3}$/.test(postalCode.replace(/\s/g, ""));
}

export interface TaxDecision { treatment: TaxTreatment | null; reviewReason: TaxReviewReason | null }

/** The treatment for a business profile (§6.14). null treatment = manual review. */
export function decideTaxTreatment(input: { country: string; kind: TaxIdKind; vies: ViesStatus; postalCode: string }): TaxDecision {
  if (input.kind === "es_nif") {
    return isSpanishSpecialTerritory(input.postalCode)
      ? { treatment: null, reviewReason: "es_special_territory" }
      : { treatment: "es_vat", reviewReason: null };
  }
  if (input.kind === "eu_vat") {
    if (input.vies === "valid") return { treatment: "eu_reverse_charge", reviewReason: null };
    if (input.vies === "invalid") return { treatment: "es_vat", reviewReason: null };
    return { treatment: null, reviewReason: "vies_unavailable" };
  }
  return { treatment: "non_eu_not_subject", reviewReason: null };
}

/** VAT rate in basis points for a treatment: 21 % IVA or none. */
export function vatRateBp(treatment: TaxTreatment) {
  return treatment === "es_vat" ? SPANISH_VAT_RATE_BP : 0;
}

/** VAT on a net amount, rounded half up to the cent (exact for every pack). */
export function vatCents(netCents: number, treatment: TaxTreatment) {
  return Math.floor((netCents * vatRateBp(treatment) + 5000) / 10000);
}

export function grossCents(netCents: number, treatment: TaxTreatment) {
  return netCents + vatCents(netCents, treatment);
}

/** The legal mention a receipt (and later the invoice) carries for the treatment. */
export function taxMention(treatment: TaxTreatment): string | null {
  if (treatment === "eu_reverse_charge") return "Inversión del sujeto pasivo";
  if (treatment === "non_eu_not_subject") return "Operación no sujeta";
  return null;
}

/* ---------------------------------------------------------------- VIES --- */

export interface ViesResult { status: "valid" | "invalid" | "unavailable"; consultation: string | null; checkedAt: Date }
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
const VIES_INVALID = new Set(["INVALID", "INVALID_INPUT", "INVALID_REQUESTER_INFO"]);

/**
 * Checks a VAT number with the EU VIES REST API. Network failures, timeouts
 * and member-state outages are retried (3 attempts by default); if VIES stays
 * unavailable the result is "unavailable" and the profile goes to manual
 * review. Never throws.
 */
export async function checkVies(
  countryPrefix: string,
  number: string,
  options: { fetch?: Fetch; attempts?: number; delaysMs?: number[]; timeoutMs?: number } = {},
): Promise<ViesResult> {
  const doFetch = options.fetch ?? fetch;
  const attempts = options.attempts ?? 3;
  const delays = options.delaysMs ?? [1500, 4000];
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, delays[Math.min(attempt - 1, delays.length - 1)] ?? 0));
    try {
      const response = await doFetch(VIES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ countryCode: countryPrefix, vatNumber: number }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
      if (!response.ok) continue;
      const body = await response.json() as { valid?: unknown; requestIdentifier?: unknown; userError?: unknown; errorWrappers?: Array<{ error?: unknown }> };
      const error = typeof body.userError === "string" ? body.userError
        : Array.isArray(body.errorWrappers) && typeof body.errorWrappers[0]?.error === "string" ? body.errorWrappers[0].error : null;
      const consultation = typeof body.requestIdentifier === "string" && body.requestIdentifier ? body.requestIdentifier.slice(0, 100) : null;
      if (body.valid === true) return { status: "valid", consultation, checkedAt: new Date() };
      if (error && VIES_INVALID.has(error)) return { status: "invalid", consultation, checkedAt: new Date() };
      if (body.valid === false && (!error || error === "VALID")) return { status: "invalid", consultation, checkedAt: new Date() };
      // MS_UNAVAILABLE, TIMEOUT, SERVICE_UNAVAILABLE, *_MAX_CONCURRENT_REQ…: retry.
    } catch {
      // Network error or timeout: retry.
    }
  }
  return { status: "unavailable", consultation: null, checkedAt: new Date() };
}
