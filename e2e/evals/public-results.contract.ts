/**
 * UI contracts for opt-in public results (launch L-31, spec P-23, P-53): the
 * public results page and an anonymous index edition in the Paper layout (EN
 * and ES at 390, 768 and 1440 px, no horizontal scroll, the limits always
 * shown, no badge or seal), and the owner's written consent on a report
 * (shown only with PUBLIC_RESULTS_ENABLED, explicit agreement, signer and
 * version sent, withdrawal). Runs against the isolated harness (ui.config.ts);
 * every API call is routed here.
 */
import { expect, test, type Page } from "@playwright/test";
import { seriousAxeViolations } from "./axe";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const CONSENT = "00000000-0000-4000-8000-000000000931";
const CREATED = "2026-10-08T10:00:00.000Z";
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
const FORBIDDEN = /\b(certified|compliant|certificado|homologado|badge|seal|sello|insignia)\b/i;

/* ----------------------------------------------------------- public pages --- */

const RESULT_COPY = {
  en: { share: "72%", sentence: "33 of 46 scored answers matched the sources.", limits: "Limits", evidence: "not a certification, an audit or a conformity assessment", method: "/en/methodology", review: "Reviewed by 2 experts on 5 October 2026." },
  es: { share: "72 %", sentence: "33 de 46 respuestas calificadas coincidieron con las fuentes.", limits: "Límites", evidence: "no una certificación, una auditoría ni una evaluación de la conformidad", method: "/es/metodologia", review: "Revisado por 2 expertos el 5 de octubre de 2026." },
} as const;

for (const locale of ["en", "es"] as const) {
  for (const width of WIDTHS) {
    test(`public results page (${locale}, ${width}px): dates, scope, sample, outcomes, methodology and limits, no badge`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/results?locale=${locale}`);
      const copy = RESULT_COPY[locale];
      const article = page.locator("[data-public-result]");
      await expect(article.getByRole("heading", { level: 1, name: "Gestoría Ejemplo" })).toBeVisible();
      await expect(article.locator("[data-result-share]")).toHaveText(copy.share);
      await expect(article).toContainText(copy.sentence);
      await expect(article).toContainText(copy.review);
      await expect(article).toContainText("Questions about invoices, VAT returns and payroll from the help centre, in Spanish.");
      await expect(article.getByRole("heading", { level: 2, name: copy.limits })).toBeVisible();
      await expect(article).toContainText(copy.evidence);
      await expect(article.locator(`a[href="${copy.method}"]`).first()).toBeVisible();
      await expect(article.locator("img")).toHaveCount(0);
      expect(await article.innerText()).not.toMatch(FORBIDDEN);
      expect(await noHorizontalScroll(page)).toBe(true);
      if (width !== 768) await page.screenshot({ path: `/tmp/evals-ui-test-results/public-results-${locale}-${width}.png`, fullPage: true });
    });
  }
}

test("public results page keeps a long company name inside a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/results?locale=es&long-name");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sociedad Limitada Profesional");
  expect(await noHorizontalScroll(page)).toBe(true);
});

const INDEX_COPY = {
  en: { sector: "Tax, accounting and payroll software", median: "64%", middle: "51% to 74%", cohort: "A sector is shown only when at least 10 systems count.", quarter: "Q3 2026" },
  es: { sector: "Software fiscal, contable y de nóminas", median: "64 %", middle: "de 51 % a 74 %", cohort: "Un sector solo se muestra cuando cuentan al menos 10 sistemas.", quarter: "3.º trimestre de 2026" },
} as const;

for (const locale of ["en", "es"] as const) {
  for (const width of WIDTHS) {
    test(`anonymous sector index (${locale}, ${width}px): aggregates by sector and the published method`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/sector-index?locale=${locale}`);
      const copy = INDEX_COPY[locale];
      const article = page.locator("[data-sector-index]");
      await expect(article).toContainText(copy.quarter);
      // A table from 768 px, one block per sector on a phone.
      const rows = width >= 768 ? article.locator("table tbody tr") : article.locator("ul li[data-sector]");
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText(copy.sector);
      await expect(rows.first()).toContainText(copy.median);
      await expect(rows.first()).toContainText(copy.middle);
      await expect(article).toContainText(copy.cohort);
      expect(await article.innerText()).not.toMatch(FORBIDDEN);
      expect(await noHorizontalScroll(page)).toBe(true);
      if (width !== 768) await page.screenshot({ path: `/tmp/evals-ui-test-results/sector-index-${locale}-${width}.png`, fullPage: true });
    });
  }
}

/* --------------------------------------------------------- owner consent --- */

function snapshot() {
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Billing assistant", target_revision_id: "t1", purpose: "Answers customers' questions about invoices.", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["es"], review_status: "preliminary" },
    metrics: { n_planned: 3, n_eligible: 3, n_executed: 3, n_scorable: 3, n_pass: 2, n_partial: 0, n_fail: 1, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 2 / 3, rubric_score: null, assessed_coverage: 1, execution_completion: 1, pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], results: [], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "v", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "All", exclusions: [], review_coverage: "Automated", cost: null, limitations: [] },
  };
}

type Calls = { gets: number; posts: Array<Record<string, unknown>>; patches: Array<Record<string, unknown>> };
async function routeReport(page: Page, canConsent = true): Promise<Calls> {
  const calls: Calls = { gets: 0, posts: [], patches: [] };
  let consents: Array<Record<string, unknown>> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Billing assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/publication`) {
      const status = () => ({ data: { canConsent, version: "2026-10-14", workspaceSector: "insurance", consents }, meta: {} });
      if (method === "GET") {
        calls.gets += 1;
        return route.fulfill({ json: status() });
      }
      if (method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        calls.posts.push(body);
        consents = [{ id: CONSENT, revisionId: REVISION, resultsPage: body.resultsPage, sectorIndex: body.sectorIndex, publicName: body.publicName ?? null, scopeSummary: body.scopeSummary ?? null,
          indexSector: body.indexSector ?? null, version: body.version, method: "in_app", signer: { name: body.signerName, role: body.signerRole }, signedAt: new Date().toISOString(), revokedAt: null, page: null }];
        return route.fulfill({ json: status() });
      }
      calls.patches.push(route.request().postDataJSON());
      consents = consents.map((item) => ({ ...item, revokedAt: new Date().toISOString() }));
      return route.fulfill({ json: status() });
    }
    if (url.pathname === `/api/evals/v1/runs/${RUN}`) {
      return route.fulfill({ json: { data: { run: { id: RUN, status: "completed", phase: "done", execution_mode: "deployed_system", suite_version_id: "s1", created_at: CREATED, reason_code: null }, units: [], targetUsage: { calls: 3, unknown: 0 } }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return calls;
}

const CONSENT_COPY = {
  en: { action: "Public page", given: "Public page: consent given", title: "Public results page", index: "Your results in the anonymous sector index", name: "Name shown on the page", scope: "What was tested", sector: "Sector",
    signer: "Your full name", role: "Your role", agree: "I have read this consent and I give it on behalf of Example client.", submit: "Give consent", pending: "Caudals reviews the page by hand", withdraw: "Withdraw consent", withdrawn: "Consent withdrawn." },
  es: { action: "Página pública", given: "Página pública: consentimiento dado", title: "Página pública de resultados", index: "Tus resultados en el índice sectorial anónimo", name: "Nombre que aparece en la página", scope: "Qué se probó", sector: "Sector",
    signer: "Tu nombre completo", role: "Tu cargo", agree: "He leído este consentimiento y lo doy en nombre de Example client.", submit: "Dar consentimiento", pending: "Caudals revisa la página a mano", withdraw: "Retirar el consentimiento", withdrawn: "Consentimiento retirado." },
} as const;

for (const locale of ["en", "es"] as const) {
  for (const width of [390, 1440] as const) {
    test(`owner consent (${locale}, ${width}px): explicit, signed and versioned, then withdrawn`, async ({ page }) => {
      if (locale === "es") await spanish(page);
      await page.setViewportSize({ width, height: 900 });
      const calls = await routeReport(page);
      await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&public-results`);
      const copy = CONSENT_COPY[locale];
      await page.getByRole("button", { name: copy.action, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: copy.title });
      await expect(dialog).toBeVisible();
      const submit = dialog.getByRole("button", { name: copy.submit });
      await dialog.getByLabel(copy.name).fill("Gestoría Ejemplo");
      await dialog.getByLabel(copy.scope).fill("Questions about invoices and VAT from our help centre, in Spanish.");
      await dialog.getByText(copy.index).click();
      await expect(dialog.getByLabel(copy.sector, { exact: true })).toHaveValue("insurance");
      await dialog.getByLabel(copy.signer).fill("Ana García");
      await dialog.getByLabel(copy.role).fill("CEO");
      // Nothing is sent without the explicit agreement.
      await expect(submit).toBeDisabled();
      await expect(dialog.locator("[data-consent-version='2026-10-14']")).toBeVisible();
      expect(await dialog.innerText()).not.toMatch(FORBIDDEN);
      await dialog.getByText(copy.agree).click();
      expect(await noHorizontalScroll(page)).toBe(true);
      if (locale === "en" && width === 1440) await page.screenshot({ path: "/tmp/evals-ui-test-results/public-results-consent.png" });
      await submit.click();
      await expect(page.getByRole("button", { name: copy.given })).toBeVisible();
      expect(calls.posts).toHaveLength(1);
      expect(calls.posts[0]).toMatchObject({
        orgId: ORG, revisionId: REVISION, resultsPage: true, sectorIndex: true, publicName: "Gestoría Ejemplo", indexSector: "insurance",
        signerName: "Ana García", signerRole: "CEO", version: "2026-10-14", locale, accepted: true,
      });
      expect(String(calls.posts[0].requestId)).toMatch(/^consent-/);

      await page.getByRole("button", { name: copy.given }).click();
      const status = page.getByRole("dialog", { name: copy.title });
      await expect(status).toContainText(copy.pending);
      await status.getByRole("button", { name: copy.withdraw }).click();
      const confirm = page.getByRole("dialog", { name: copy.withdraw });
      await confirm.getByRole("button", { name: copy.withdraw }).click();
      await expect(page.getByText(copy.withdrawn)).toBeVisible();
      expect(calls.patches).toEqual([{ orgId: ORG, consentId: CONSENT }]);
      await expect(page.getByRole("button", { name: copy.action, exact: true })).toBeVisible();
    });
  }
}

test("the public results page, the index and the consent dialog are axe-clean", async ({ page }) => {
  for (const path of ["/results?locale=es", "/sector-index?locale=en"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await seriousAxeViolations(page, { include: "main" }), path).toEqual([]);
  }
  await routeReport(page);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&public-results`);
  await page.getByRole("button", { name: "Public page", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Public results page" })).toBeVisible();
  expect(await seriousAxeViolations(page, { include: "[role=dialog]" })).toEqual([]);
});

test("owner consent stays hidden while PUBLIC_RESULTS_ENABLED is off, and from editors", async ({ page }) => {
  const calls = await routeReport(page);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Public page", exact: true })).toHaveCount(0);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&editor&public-results`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Public page", exact: true })).toHaveCount(0);
  expect(calls.gets).toBe(0);
});

test("a workspace operator reads the consent but only an owner signs", async ({ page }) => {
  await routeReport(page, false);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&public-results`);
  await page.getByRole("button", { name: "Public page", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Public results page" });
  await expect(dialog).toContainText("Only a workspace owner can give or withdraw this consent.");
  await expect(dialog.getByRole("button", { name: "Give consent" })).toHaveCount(0);
});
