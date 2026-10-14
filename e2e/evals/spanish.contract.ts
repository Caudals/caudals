import { expect, test, type Page } from "@playwright/test";
import { expectSpanishOnly } from "./spanish-leaks";

/**
 * Launch L-23 (spec P-45): the app screens in Spanish carry no English
 * interface copy. Each screen is opened with the Spanish interface, checked
 * with the leak scanner (spanish-leaks.ts) at 390 and 1440 px, and saved as a
 * screenshot for the native-speaker review (docs/launch/es-review-checklist.md).
 * The demo, billing, Home, the report and the evaluation page also run the
 * scanner inside their own Spanish contracts.
 */
const org = "00000000-0000-4000-8000-000000000001";
const SHOTS = "/tmp/evals-ui-test-results/spanish";

async function spanish(page: Page) {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
}

async function check(page: Page, screen: string, ready: () => Promise<void>, words = false) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await ready();
    await expectSpanishOnly(page, screen, { words });
    await page.screenshot({ path: `${SHOTS}/${screen.replace(/\W+/g, "-")}-${width}.png`, fullPage: true });
  }
}

test.beforeEach(async ({ page }) => {
  await spanish(page);
});

test("sign-in and direct sign-up read in Spanish", async ({ page }) => {
  await page.goto("/workspace/sign-in?direct");
  await check(page, "sign-in", () => expect(page.getByRole("heading", { name: "Inicia sesión en Caudals" })).toBeVisible());
  await page.goto("/workspace/start");
  await check(page, "sign-up", () => expect(page.getByRole("heading", { name: "Crea tu espacio de trabajo gratuito" })).toBeVisible());
});

test("the demo start page reads in Spanish", async ({ page }) => {
  await page.route("**/api/demo/challenge", (route) => route.fulfill({ json: {
    open: true, reason: null, last: null, notify: true, fallback: false, service: "ok",
    challenge: { salt: "harness", bits: 1, expires: Date.now() + 600_000, signature: "harness" },
    queue: { waiting: 0, active: 0, slots: 3, durations: { p50: 240, p90: 480 } },
  } }));
  await page.goto("/demo?locale=es");
  await check(page, "demo start", () => expect(page.getByLabel("Tu asistente")).toBeVisible());
});

test("the evaluations list, settings, help and the example read in Spanish", async ({ page }) => {
  await page.goto(`/workspace/evaluations?owner&orgId=${org}`);
  await check(page, "evaluations list", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
  await page.goto(`/workspace/settings?owner&orgId=${org}`);
  await check(page, "settings", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
  await page.goto("/workspace/help");
  await check(page, "help centre", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
  await page.goto("/workspace/example?owner");
  await check(page, "example evaluation", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
});

test("a report reads in Spanish, with its tabs", async ({ page }) => {
  await page.goto("/workspace/reports/fixture-v2");
  // The fixture's content is Spanish too, so any common English word is a leak.
  await check(page, "report", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible(), true);
  await page.getByRole("tab", { name: /Resultados de las pruebas/ }).click();
  await expectSpanishOnly(page, "report results tab", { words: true });
  await page.getByRole("tab", { name: /Metodología/ }).click();
  await expectSpanishOnly(page, "report methodology tab", { words: true });
});

test("the expert queue and the ops improvement datasets read in Spanish", async ({ page }) => {
  const batch = "00000000-0000-4000-8000-000000000121";
  await page.route("**/api/evals/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/review/assignments")) return route.fulfill({ json: { data: [], meta: {} } });
    if (path.endsWith("/improvement-batches")) return route.fulfill({ json: { data: [
      { id: batch, project_id: "00000000-0000-4000-8000-000000000126", title: "Correcciones de pólizas", objective: "Corregir respuestas sin fuente.", status: "in_review", lock_version: 0, task_count: 1, item_count: 1 },
    ], meta: {} } });
    if (path.endsWith(`/improvement-batches/${batch}`)) return route.fulfill({ json: { data: {
      batch: { id: batch, project_id: "p", title: "Correcciones de pólizas", objective: "Corregir respuestas sin fuente.", status: "in_review", lock_version: 0 },
      tasks: [{ id: "t", kind: "corrected_response", split: "holdout", family_id: "polizas" }],
      items: [{ id: "i", revision_id: "r", kind: "corrected_response", split: "holdout", family_id: "polizas", decision: null, rights_status: null, redaction_status: null }],
      releases: [],
    }, meta: {} } });
    return route.fallback();
  });
  await page.goto("/review");
  await check(page, "expert queue", () => expect(page.getByRole("tab", { name: "Abiertas" })).toBeVisible());
  await page.goto("/ops/improvements");
  await check(page, "improvement datasets", () => expect(page.getByRole("tab", { name: "Lotes" })).toBeVisible());
  await page.getByRole("button", { name: "Abrir Correcciones de pólizas" }).click();
  await expect(page.getByRole("tab", { name: "Construcción y control de calidad" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("cell", { name: "Reserva" })).toBeVisible();
  await expectSpanishOnly(page, "improvement build and QA", { words: true });
  await page.getByRole("tab", { name: "Evidencia de seguimiento" }).click();
  await expectSpanishOnly(page, "improvement follow-up", { words: true });
});
