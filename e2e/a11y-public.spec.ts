import { expect, test } from "@playwright/test";
import { seriousAxeViolations } from "./evals/axe";

/**
 * Launch L-24 (P-46): axe on the served pages (no fixtures), with no serious
 * or critical violation: the landing and the demo in English and Spanish on
 * the public host, sign-in and sign-up on the app host. Read-only: it loads
 * pages and never submits a form, so it can run against production:
 *
 *   PLAYWRIGHT_BASE_URL=https://caudals.com PLAYWRIGHT_APP_URL=https://app.caudals.com \
 *     npx playwright test e2e/a11y-public.spec.ts --project=chromium
 *
 * CI runs it against the production build it starts for Lighthouse. The
 * demo's live and report views and the signed-in screens are covered in the
 * UI harness (e2e/evals/a11y.contract.ts).
 */
const appURL = process.env.PLAYWRIGHT_APP_URL ?? "";

const pages: Array<{ name: string; path: string; app?: boolean; ready: (page: import("@playwright/test").Page) => Promise<void> }> = [
  { name: "landing (en)", path: "/en", ready: async (page) => { await expect(page.locator("main h1").first()).toBeVisible(); } },
  { name: "landing (es)", path: "/es", ready: async (page) => { await expect(page.locator("main h1").first()).toBeVisible(); } },
  { name: "demo (en)", path: "/en/demo", ready: async (page) => { await expect(page.getByLabel("Your assistant")).toBeVisible(); } },
  { name: "demo (es)", path: "/es/demo", ready: async (page) => { await expect(page.locator("main h1").first()).toBeVisible(); } },
  { name: "sign-in", path: "/workspace/sign-in", app: true, ready: async (page) => { await expect(page.getByLabel("Email")).toBeVisible(); } },
  { name: "direct sign-up", path: "/workspace/start", app: true, ready: async (page) => { await expect(page.getByLabel("Work email")).toBeVisible(); } },
];

for (const item of pages) {
  test(`axe: ${item.name}`, async ({ page }) => {
    // Checked at rest: no entrance or scroll-driven reveal half-way through.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(item.app && appURL ? `${appURL}${item.path}` : item.path);
    await item.ready(page);
    // A first visit shows the cookie notice: check it too, once it is on screen.
    if (!item.app) await expect(page.getByRole("dialog", { name: /^(Cookie notice|Aviso de cookies)$/ })).toBeVisible();
    expect(await seriousAxeViolations(page), `axe: ${item.name}`).toEqual([]);
  });
}
