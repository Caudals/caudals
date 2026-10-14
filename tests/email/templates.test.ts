import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en, es } from "@/lib/email/copy";
import { EmailLayout } from "@/lib/email/layout";
import { renderToStaticHtml } from "@/lib/email/render";
import { emailContent, renderEmail, TEMPLATE_CATEGORY, type TemplateName, type TemplateProps } from "@/lib/email/templates";

const APP = "https://app.caudals.com";
const ORG = "00000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(64);
const unsubscribe = { pageUrl: `${APP}/workspace/unsubscribe#${TOKEN}`, oneClickUrl: `${APP}/api/evals/v1/email/unsubscribe?token=${TOKEN}` };
const notice = { url: `${APP}/workspace/evaluations/e1?orgId=${ORG}`, settingsUrl: `${APP}/workspace/settings?orgId=${ORG}&tab=notifications` };
const billing = `${APP}/workspace/settings?orgId=${ORG}&tab=billing`;

/** One realistic set of props per template; every template must be listed. */
const FIXTURES: { [K in TemplateName]: TemplateProps[K] } = {
  signup_link: { link: `${APP}/workspace/signup#tok`, source: "demo", demo: { host: "acme.example", correct: 5, scored: 8 } },
  signup_existing: { signInUrl: `${APP}/workspace/sign-in` },
  signup_domain_taken: { domain: "acme.example" },
  password_reset: { url: `${APP}/api/auth/reset-password/tok?callbackURL=%2Fworkspace%2Freset-password`, minutes: 30 },
  invitation: { url: `${APP}/workspace/invitations#token=tok`, workspace: "Acme", inviter: "Ana García", role: "editor", hours: 24 },
  test_set_ready: notice,
  report_published: { ...notice, url: `${APP}/workspace/reports/r1?orgId=${ORG}` },
  run_failed: notice,
  input_required: notice,
  export_failed: notice,
  generation_failed: notice,
  website_failed: notice,
  document_failed: notice,
  welcome: { name: "Ana García", workspace: "Acme", workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, unsubscribe },
  d1_test_set: { workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, callUrl: "https://cal.com/caudals/call", unsubscribe },
  d3_run: { workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, hasTestSet: true, unsubscribe },
  d7_report: { workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, callUrl: "https://cal.com/caudals/call", unsubscribe },
  first_report: { reportsUrl: `${APP}/workspace/reports?orgId=${ORG}`, callUrl: "https://cal.com/caudals/call", unsubscribe },
  d21_rerun: { workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, unsubscribe },
  d30_winback: { workspace: "Acme", workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, callUrl: "https://cal.com/caudals/call", unsubscribe },
  payment_receipt: { workspace: "Acme", amountCents: 12100, currency: "EUR", credits: 10000, paidAt: "2026-10-12T10:00:00Z", reference: "pi_test_123", billingUrl: billing },
  invoice_available: { workspace: "Acme", kind: "invoice", number: "CAU-2026-0001", issueDate: "2026-10-13", totalCents: 2420, currency: "EUR", billingUrl: billing },
  price_increase: { workspace: "Acme", effectiveAt: "2027-01-01T00:00:00Z", models: [{ label: "Gemini 3.8 Flash", now: "100 · 485", next: "195 · 970" }], modelsUrl: `${APP}/workspace/settings/models?orgId=${ORG}` },
  low_balance: { workspace: "Acme", balance: 420, threshold: 500, topUpUrl: billing, settingsUrl: notice.settingsUrl },
  auto_recharge_succeeded: { workspace: "Acme", amountCents: 6050, currency: "EUR", credits: 5000, threshold: 500, balance: 5420, billingUrl: billing, settingsUrl: notice.settingsUrl },
  auto_recharge_failed: { workspace: "Acme", amountCents: 6050, currency: "EUR", billingUrl: billing, settingsUrl: notice.settingsUrl },
  credits_expiring: { workspace: "Acme", credits: 1200, expiresAt: "2026-11-11T23:00:00Z", workspaceUrl: `${APP}/workspace/evaluations?orgId=${ORG}`, settingsUrl: notice.settingsUrl },
  cap_reached: { workspace: "Acme", cap: 20000, percent: 100, scope: "monthly", limitsUrl: billing, settingsUrl: notice.settingsUrl },
  schedule_skipped: { workspace: "Acme", evaluation: "Claims assistant", scheduledFor: "2026-11-02T08:00:00Z", reason: "credits", needed: 340, available: 120,
    nextRunAt: "2026-12-07T08:00:00Z", actionUrl: `${billing}&view=top-up`, settingsUrl: notice.settingsUrl },
  monitor_regression: { evaluation: "Claims assistant", scheduledFor: "2026-11-02T08:00:00Z", now: { pass: 36, scored: 50 }, before: { pass: 40, scored: 50 },
    broken: [{ title: "Management fee under €10,000", url: `${APP}/workspace/reports/r1?orgId=${ORG}&result=a1` }, { title: "Custody fee", url: `${APP}/workspace/reports/r1?orgId=${ORG}&result=a2` }],
    brokenTotal: 7, reportUrl: `${APP}/workspace/reports/r1?orgId=${ORG}`, settingsUrl: notice.settingsUrl },
  monitor_summary: { appUrl: APP, orgId: ORG, workspace: "Acme", summary: {
    version: 1, status: "regression", comparable: true, reasons: ["paired_case_regressed"], evaluation: { id: "e1", title: "Claims assistant" },
    scheduleId: "s1", dispatchId: "d1", scheduledFor: "2026-11-02T08:00:00Z",
    candidate: { runId: "r2", reportId: "r1", score: { pass: 36, scored: 50 } }, baseline: { runId: "r0", reportId: "r0", score: { pass: 40, scored: 50 } },
    newlyBroken: [{ caseRevisionId: "c1", title: "Management fee under €10,000", severity: "high", before: "pass", after: "fail", assessmentId: "a1", baselineAssessmentId: "b1" }],
    newlyBrokenTotal: 4, fixedTotal: 0 } },
  demo_report: { subject: "Your test of acme.example is ready", heading: "Your test of acme.example is ready", lines: ["5 of 8 answers match your website."], url: "https://caudals.com/en/demo#r=x", failed: false, footer: "You asked for this email on caudals.com." },
};

const NAMES = Object.keys(TEMPLATE_CATEGORY) as TemplateName[];
const LOCALES = ["en", "es"] as const;

describe("email templates", () => {
  it("has a fixture for every template", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    for (const locale of LOCALES) {
      it(`${name} renders in ${locale}`, () => {
        const email = renderEmail(name, locale, FIXTURES[name] as never);
        expect(email.subject.length).toBeGreaterThan(5);
        expect(email.html.startsWith("<!DOCTYPE html")).toBe(true);
        expect(email.html).toContain(`<html lang="${locale}"`);
        // Every placeholder filled, no template syntax left over.
        for (const part of [email.subject, email.html, email.text]) expect(part).not.toMatch(/\{\w+\}|undefined|NaN|\[object Object\]/);
        // The main link is in both versions.
        const action = emailContent(name, locale, FIXTURES[name] as never).blocks.find((block) => block.kind === "action");
        // Every email but "your company already has a workspace" has one main action.
        if (name !== "signup_domain_taken") expect(action).toBeDefined();
        if (action?.kind === "action") {
          expect(email.text).toContain(action.url);
          expect(email.html).toContain(`href="${action.url.replace(/&/g, "&amp;")}"`);
        }
        // Category rules: unsubscribe only on lifecycle mail, settings link on notifications and billing alerts.
        if (TEMPLATE_CATEGORY[name] === "lifecycle") {
          expect(email.text).toContain(unsubscribe.pageUrl);
          expect(email.headers).toEqual({ "List-Unsubscribe": `<${unsubscribe.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
        } else {
          expect(email.html).not.toContain("/workspace/unsubscribe");
          expect(email.headers).toBeUndefined();
        }
        if (TEMPLATE_CATEGORY[name] === "notification" || TEMPLATE_CATEGORY[name] === "billing") expect(email.text).toContain("tab=notifications");
        // No certification or compliance claims; no legal-entity placeholders.
        expect(`${email.subject} ${email.text}`).not.toMatch(/certif|complian|AI Act|B00000000|Calle Ejemplo/i);
        expect({ subject: email.subject, text: email.text }).toMatchSnapshot();
        expect(email.html).toMatchSnapshot();
      });
    }
  }

  it("speaks Spanish in Spanish", () => {
    for (const name of NAMES.filter((item) => item !== "demo_report")) {
      const english = renderEmail(name, "en", FIXTURES[name] as never);
      const spanish = renderEmail(name, "es", FIXTURES[name] as never);
      expect(spanish.subject).not.toBe(english.subject);
      expect(spanish.text).toContain("El equipo de Caudals");
    }
  });

  it("puts the one-line score summary on the demo sign-up link", () => {
    expect(renderEmail("signup_link", "en", FIXTURES.signup_link).text).toContain("Your test of acme.example: 5 of 8 answers matched your website.");
    expect(renderEmail("signup_link", "es", FIXTURES.signup_link).text).toContain("Tu prueba de acme.example: 5 de 8 respuestas coincidieron con tu web.");
    expect(renderEmail("signup_link", "en", { ...FIXTURES.signup_link, demo: { host: "acme.example", scored: 0 } }).text).toContain("Your test of acme.example has finished.");
    expect(renderEmail("signup_link", "en", { link: FIXTURES.signup_link.link, source: "direct" }).text).not.toContain("acme.example");
  });

  it("formats money, credits and dates for each language", () => {
    const receiptEn = renderEmail("payment_receipt", "en", FIXTURES.payment_receipt).text;
    const receiptEs = renderEmail("payment_receipt", "es", FIXTURES.payment_receipt).text;
    expect(receiptEn).toContain("€121.00");
    expect(receiptEn).toContain("10,000");
    expect(receiptEn).toContain("12 October 2026");
    expect(receiptEs).toMatch(/121,00\s€/);
    expect(receiptEs).toContain("12 de octubre de 2026");
    // The expiry date is the Madrid calendar day.
    expect(renderEmail("credits_expiring", "en", FIXTURES.credits_expiring).subject).toContain("12 November 2026");
    expect(renderEmail("cap_reached", "es", { ...FIXTURES.cap_reached, percent: 80, scope: "run" }).subject).toBe("Has usado el 80 % de tu límite de gasto de Caudals");
  });

  it("escapes customer-supplied text", () => {
    const email = renderEmail("invitation", "en", { ...FIXTURES.invitation, workspace: `<script>alert("x")</script> & Co`, inviter: "O'Brien" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
    expect(email.html).toContain("O&#x27;Brien");
    expect(() => renderEmail("signup_existing", "en", { signInUrl: "javascript:alert(1)" })).toThrow("email_template_unsafe_link");
  });

  it("matches react-dom/server markup for every template", () => {
    for (const name of NAMES) {
      for (const locale of LOCALES) {
        const content = emailContent(name, locale, FIXTURES[name] as never);
        const body = (html: string) => html.slice(html.indexOf("<body"), html.indexOf("</body>") + 7);
        const ours = renderToStaticHtml(createElement(EmailLayout, { content }));
        const react = renderToStaticMarkup(createElement(EmailLayout, { content }));
        expect(body(ours)).toBe(body(react));
      }
    }
  });

  it("has the same structure in both languages (launch L-23)", () => {
    for (const name of NAMES) {
      const shape = (locale: "en" | "es") => {
        const content = emailContent(name, locale, FIXTURES[name] as never);
        return {
          blocks: content.blocks.map((block) => block.kind === "action" || block.kind === "link" ? `${block.kind}:${block.url}`
            : block.kind === "steps" ? `steps:${block.items.length}` : block.kind === "facts" ? `facts:${block.rows.length}` : block.kind),
          footer: content.footer.length,
          footerLink: content.footerLink?.url ?? null,
        };
      };
      expect(shape("es"), name).toEqual(shape("en"));
    }
  });

  it("leaks no copy from the other language into a rendered email (launch L-23)", () => {
    const flatten = (tree: object, prefix = ""): Record<string, string> =>
      Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) =>
        typeof value === "string" ? { ...out, [prefix + key]: value } : { ...out, ...flatten(value, `${prefix}${key}.`) }, {});
    const english = flatten(en), spanish = flatten(es);
    // The fixed wording of each catalogue that differs from the other language, cut at its {slots}.
    const fragments = (own: Record<string, string>, other: Record<string, string>) => [...new Set(Object.entries(own)
      .filter(([key, value]) => value !== other[key])
      .flatMap(([, value]) => value.split(/\{\w+\}/))
      .map((part) => part.replace(/\s+/g, " ").replace(/^[\s.,:;·—–-]+|[\s.,:;·—–-]+$/g, ""))
      .filter((part) => (part.match(/\p{L}{2,}/gu) ?? []).length >= 2))];
    const englishOnly = fragments(english, spanish), spanishOnly = fragments(spanish, english);
    // Props written by the caller in the reader's language (the demo email's wording comes from the site catalogue).
    const props = (name: TemplateName, locale: "en" | "es") => name === "demo_report" && locale === "es"
      ? { ...FIXTURES.demo_report, subject: "Tu prueba de acme.example está lista", heading: "Tu prueba de acme.example está lista", lines: ["5 de 8 respuestas coinciden con tu web."], footer: "Pediste este correo en caudals.com." }
      : FIXTURES[name];
    for (const name of NAMES) {
      for (const [locale, foreign] of [["es", englishOnly], ["en", spanishOnly]] as const) {
        const email = renderEmail(name, locale, props(name, locale) as never);
        const visible = `${email.subject}\n${email.text}`.replace(/\s+/g, " ");
        const leaks = foreign.filter((fragment) => new RegExp(`(?<![\\p{L}\\p{N}])${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(visible));
        expect(leaks, `${name} (${locale})`).toEqual([]);
      }
    }
  });

  it("keeps the two catalogues in step and filled", () => {
    const flatten = (tree: object, prefix = ""): Record<string, string> =>
      Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) =>
        typeof value === "string" ? { ...out, [prefix + key]: value } : { ...out, ...flatten(value, `${prefix}${key}.`) }, {});
    const english = flatten(en), spanish = flatten(es);
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(spanish)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(new Set(value.match(/\{\w+\}/g) ?? []), key).toEqual(new Set(english[key].match(/\{\w+\}/g) ?? []));
    }
  });
});
