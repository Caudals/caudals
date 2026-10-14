/**
 * Partner accounts (launch L-28): the PARTNERS_ENABLED gate, referral codes
 * and links, the logo checks, the statement CSV, the EN/ES copy and the
 * white-label cover. Database behaviour (RLS, attribution, statement against
 * the ledger) is in tests/evals/partners-db.test.ts.
 */
import { describe, expect, it } from "vitest";
import { jpegHeader, pngBytes } from "../../../tests/evals/partner-fixtures";
import { exampleView } from "../example";
import { renderReportDocument } from "../reports/document";
import { brandSuffix } from "./brand";
import { isPartnerCode, referralLinks } from "./codes";
import { PARTNER_COPY, partnerCopy } from "./copy";
import { partnerEnabled, partnersMode } from "./flags";
import { inspectLogo, LogoError, MAX_LOGO_BYTES, partnerLogoKey } from "./logo";
import { renderStatementCsv, statementFileName, statementMonth, statementTotals, type StatementRow } from "./statement";
import { sanitizeAttribution } from "../../analytics/events";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

describe("PARTNERS_ENABLED", () => {
  it("is off unless set, and opens all partners, listed partners or only the ops API", () => {
    for (const value of [undefined, "", "false", "off", "1", "yes", "operators"]) {
      const mode = partnersMode({ PARTNERS_ENABLED: value });
      expect(mode.admin).toBe(false);
      expect(partnerEnabled(mode, P1)).toBe(false);
    }
    const all = partnersMode({ PARTNERS_ENABLED: "true" });
    expect([all.admin, partnerEnabled(all, P1), partnerEnabled(all, P2)]).toEqual([true, true, true]);
    const listed = partnersMode({ PARTNERS_ENABLED: ` ${P1.toUpperCase()} , not-a-uuid ` });
    expect([listed.admin, listed.all, partnerEnabled(listed, P1), partnerEnabled(listed, P2)]).toEqual([true, false, true, false]);
    const admins = partnersMode({ PARTNERS_ENABLED: "admins" });
    expect([admins.admin, partnerEnabled(admins, P1)]).toEqual([true, false]);
  });
});

describe("referral codes", () => {
  it("accepts only database codes and builds the demo and sign-up links", () => {
    expect(isPartnerCode("cp-0123456789")).toBe(true);
    for (const value of ["cp-012345678", "cp-0123456789a", "CP-0123456789", "sr-0123456789ab", "cp-012345678g", 42, null]) expect(isPartnerCode(value)).toBe(false);
    const links = referralLinks("cp-0123456789", { marketing: "https://caudals.com/", app: "https://app.caudals.com" });
    expect(links.demo.en).toBe("https://caudals.com/en/demo?utm_source=partner&utm_medium=referral&partner=cp-0123456789");
    expect(links.demo.es).toBe("https://caudals.com/es/demo?utm_source=partner&utm_medium=referral&partner=cp-0123456789");
    expect(links.signup).toBe("https://app.caudals.com/workspace/start?utm_source=partner&utm_medium=referral&partner=cp-0123456789");
    expect(() => referralLinks("cp-x", { marketing: "https://caudals.com", app: "https://app.caudals.com" })).toThrow();
  });

  it("survives L-02's first-touch sanitising as both `partner` and `ref`", () => {
    const links = referralLinks("cp-a1b2c3d4e5", { marketing: "https://caudals.com", app: "https://app.caudals.com" });
    const params = new URL(links.signup).searchParams;
    expect(sanitizeAttribution(Object.fromEntries(params))).toEqual({ utm_source: "partner", utm_medium: "referral", partner: "cp-a1b2c3d4e5" });
    expect(sanitizeAttribution({ ref: "cp-a1b2c3d4e5" })).toEqual({ ref: "cp-a1b2c3d4e5" });
  });
});

describe("partner logo", () => {
  it("accepts PNG and JPEG by their bytes and reads the size", () => {
    expect(inspectLogo(pngBytes(120, 40))).toEqual({ mediaType: "image/png", width: 120, height: 40, bytes: pngBytes(120, 40).length });
    expect(inspectLogo(jpegHeader(300, 100))).toMatchObject({ mediaType: "image/jpeg", width: 300, height: 100 });
  });

  it("refuses SVG, other types, empty, oversized and out-of-range images", () => {
    const code = (bytes: Uint8Array) => { try { inspectLogo(bytes); return "ok"; } catch (error) { return (error as LogoError).code; } };
    expect(code(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBe("LOGO_TYPE");
    expect(code(Buffer.from("GIF89a......"))).toBe("LOGO_TYPE");
    expect(code(Buffer.alloc(0))).toBe("LOGO_EMPTY");
    expect(code(Buffer.concat([pngBytes(), Buffer.alloc(MAX_LOGO_BYTES)]))).toBe("LOGO_TOO_LARGE");
    expect(code(pngBytes(8, 8))).toBe("LOGO_DIMENSIONS");
    expect(code(jpegHeader(5000, 100))).toBe("LOGO_DIMENSIONS");
    // A PNG signature with a forged first chunk is not a PNG.
    const forged = pngBytes(); forged.write("IDAT", 12, "ascii");
    expect(code(forged)).toBe("LOGO_TYPE");
  });

  it("keeps logos under the partner's own private prefix", () => {
    expect(partnerLogoKey(P1, P2)).toBe(`evals/partners/${P1}/logo/${P2}`);
    expect(() => partnerLogoKey("../x", P2)).toThrow();
  });
});

describe("monthly statement", () => {
  const rows: StatementRow[] = [
    { section: "referral_payment", occurredAt: "2026-10-02T10:00:00.000Z", orgId: P1, workspace: "Acme SL", reference: "o1", detail: "checkout", netCents: 2000, shareCents: 400, creditsUcr: null, returnedUcr: null },
    { section: "referral_payment", occurredAt: "2026-10-03T10:00:00.000Z", orgId: P1, workspace: "Acme SL", reference: "o2", detail: "checkout", netCents: 5000, shareCents: 1000, creditsUcr: null, returnedUcr: null },
    { section: "referral_reversal", occurredAt: "2026-10-04T10:00:00.000Z", orgId: P1, workspace: "Acme SL", reference: "o2", detail: "refunded", netCents: -5000, shareCents: -1000, creditsUcr: null, returnedUcr: null },
    { section: "allowance_grant", occurredAt: "2026-10-05T10:00:00.000Z", orgId: P2, workspace: "=HYPERLINK(\"x\")", reference: "e1", detail: "2026-10", netCents: null, shareCents: null, creditsUcr: 1_000_000_000, returnedUcr: null },
    { section: "client_usage", occurredAt: null, orgId: P2, workspace: "Client, two", reference: null, detail: null, netCents: null, shareCents: null, creditsUcr: 250_500_000, returnedUcr: 50_000_000 },
  ];

  it("totals referred revenue, the share and its credit equivalent, grants and usage", () => {
    expect(statementTotals(rows)).toEqual({ referredNetCents: 2000, revenueShareCents: 400, creditEquivalent: 400, allowanceCredits: 1000, usedCredits: 250.5, returnedCredits: 50 });
  });

  it("writes a formula-safe CSV whose amounts add up as written", () => {
    const csv = renderStatementCsv({ partner: "Agencia Ñ", month: "2026-10", mode: "test", revenueShareBps: 2000, generatedAt: "2026-11-01T00:00:00.000Z" }, rows);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("section,date,workspace_id,workspace,reference,detail,net_eur,revenue_share_eur,credits,credits_returned");
    expect(lines[1]).toMatch(/^statement,2026-11-01T00:00:00.000Z,,Agencia Ñ,2026-10,"?Stripe test mode; revenue share 20 %/);
    expect(lines).toContain(`referral_reversal,2026-10-04T10:00:00.000Z,${P1},Acme SL,o2,refunded,-50.00,-10.00,,`);
    expect(csv).toContain(`'=HYPERLINK(""x"")`);
    expect(csv).toContain(`"Client, two"`);
    expect(lines.at(-4)).toBe("total_referred_revenue,,,,2026-10,,20.00,4.00,,");
    expect(lines.at(-3)).toBe("total_revenue_share_credits,,,,2026-10,,,,400,");
    expect(lines.at(-2)).toBe("total_allowance_granted,,,,2026-10,,,,1000,");
    expect(lines.at(-1)).toBe("total_client_usage,,,,2026-10,,,,250.5,50");
    const net = lines.filter((line) => line.startsWith("referral_")).reduce((total, line) => total + Number(line.split(",")[6]), 0);
    expect(net).toBe(20);
  });

  it("names the file and defaults to the previous Madrid month", () => {
    expect(statementFileName("Agencia Ñoño & Co.", "2026-10", "live")).toBe("Caudals-partner-statement-Agencia-Nono-Co-2026-10.csv");
    expect(statementFileName("", "2026-10", "test")).toBe("Caudals-partner-statement-partner-2026-10-test.csv");
    expect(statementMonth("2026-09", new Date("2026-10-13T12:00:00Z"))).toBe("2026-09");
    expect(statementMonth("2026-13", new Date("2026-10-13T12:00:00Z"))).toBe("2026-09");
    // 1 January 00:30 in Madrid is still 31 December in UTC: the previous month is December.
    expect(statementMonth(null, new Date("2026-12-31T23:30:00Z"))).toBe("2026-12");
    expect(statementMonth(null, new Date("2026-01-15T12:00:00Z"))).toBe("2025-12");
  });
});

describe("EN/ES copy", () => {
  it("has every key in both languages with the same placeholders and no certification wording", () => {
    const keys = Object.keys(PARTNER_COPY.en) as Array<keyof typeof PARTNER_COPY.en>;
    expect(Object.keys(PARTNER_COPY.es).sort()).toEqual([...keys].sort());
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of keys) {
      expect(placeholders(PARTNER_COPY.es[key]), key).toEqual(placeholders(PARTNER_COPY.en[key]));
      expect(PARTNER_COPY.es[key].trim().length, key).toBeGreaterThan(0);
    }
    expect(JSON.stringify(PARTNER_COPY)).not.toMatch(/certif|compliant|conformidad|cumpl/i);
    expect(partnerCopy("es").tv("statShareMeta", { rate: 20, credits: "400" })).toBe("20 % o 400 créditos");
  });
});

describe("white-label PDF cover", () => {
  const report = exampleView("en").report;
  const logo = `data:image/png;base64,${pngBytes().toString("base64")}`;

  it("adds the partner's logo and name under the Caudals brand bar, which stays", () => {
    const plain = renderReportDocument(report, "en");
    expect(plain).not.toContain("data-partner");
    for (const locale of ["en", "es"] as const) {
      const html = renderReportDocument(report, locale, new Set(), { partner: { name: "Agencia <Uno>", logoDataUri: logo } });
      expect(html).toContain('<span class="name">Caudals</span>');
      expect(html).toContain(`<img src="${logo}" alt="Agencia &lt;Uno&gt;">`);
      expect(html).toContain("<b>Agencia &lt;Uno&gt;</b>");
      expect(html).toContain(locale === "es" ? "Entregado por" : "Delivered by");
      expect(html).toContain(locale === "es" ? "Evaluación y metodología de Caudals" : "Evaluation and methodology by Caudals");
      expect(html.indexOf("data-partner")).toBeGreaterThan(html.indexOf('class="brandbar"'));
      expect(html.split("data-partner")[1].slice(0, 600)).not.toMatch(/certif|compliant|conformidad/i);
    }
  });

  it("never embeds anything but a PNG or JPEG data URI", () => {
    const html = renderReportDocument(report, "en", new Set(), { partner: { name: "Agency", logoDataUri: "https://evil.test/x.png\" onerror=\"alert(1)" } });
    expect(html).toContain("data-partner");
    expect(html).not.toContain("evil.test");
    expect(renderReportDocument(report, "en", new Set(), { partner: { name: "Agency", logoDataUri: "data:image/svg+xml;base64,PHN2Zz4=" } })).not.toContain("svg+xml");
  });

  it("names branded files by the logo's hash", () => {
    expect(brandSuffix(null)).toBe("");
    expect(brandSuffix({ partnerId: P1, logoSha256: "abcdef0123456789".padEnd(64, "0") })).toBe(".babcdef01");
  });
});
