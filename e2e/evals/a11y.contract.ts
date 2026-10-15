import { test, expect, type Page } from "@playwright/test";
import { seriousAxeViolations } from "./axe";
import { evaluationId, id, routeBilling } from "./billing-fixtures";

/**
 * Launch L-24 (P-46): WCAG 2.2 AA on the core flows. axe reports no serious or
 * critical violation on the twelve core screens (landing, demo start, live and
 * report, sign-up, sign-in, evaluations list, new evaluation, evaluation page,
 * report, billing and top-up) in English and Spanish; dialogs keep focus and
 * give it back; progress is announced through live regions; nothing moves
 * under reduced motion; and the funnel (landing → demo → report → sign-up)
 * can be completed with the keyboard alone. The harness renders the client
 * components with fixture APIs; production pages get the same axe pass in
 * e2e/a11y-public.spec.ts.
 */

const runId = "00000000-0000-4000-8000-00000000d024";
const runToken = "c".repeat(32);
const signupToken = "d".repeat(43);
const salt = "0123456789abcdef0123456789abcdef";

function intro() {
  return {
    open: true, reason: null, last: null, notify: true, fallback: false, service: "ok",
    challenge: { salt, bits: 1, expires: Date.now() + 600_000, signature: "f".repeat(64) },
    queue: { waiting: 0, active: 0, slots: 3, durations: { p50: 240, p90: 480 } },
  };
}

function cases(count: number, verdicts: boolean) {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index + 1}`, question: `Question ${index + 1} about the cover?`, expected: "The answer the site gives.", facts: ["fact"],
    quote: "The sentence from the page.", page: 0, severity: "medium",
    answer: index < 3 || verdicts ? { text: "An answer from the assistant.", ms: 900, error: null } : null,
    verdict: verdicts ? { verdict: index < 5 ? "correct" : index === 5 ? "partial" : index === 6 ? "no_answer" : "incorrect", cause: index < 5 ? null : "wrong_information", note: "Why.", facts: [], method: "judge" } : null,
  }));
}

function runView(phase: "asking" | "done") {
  const now = new Date().toISOString();
  const started = new Date(Date.now() - 95_000).toISOString();
  return {
    id: runId, phase, error: null, locale: "en", language: "en",
    target: { kind: "website", host: "example.test", url: "https://example.test/" }, docs: { host: "example.test", url: "https://example.test/" },
    pages: [{ title: "Help", url: "https://example.test/help" }], cases: cases(8, phase === "done"),
    summary: phase === "done" ? { total: 8, scored: 8, correct: 5, partial: 1, incorrect: 1, no_answer: 1, unscored: 0, causes: { wrong_information: 3 } } : null,
    browser: { chat: phase === "done" ? "done" : "running", docs: null, chatFound: true }, version: phase === "done" ? 9 : 4,
    createdAt: started, startedAt: started, finishedAt: phase === "done" ? now : null, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), claimed: false,
    queue: null, durations: { p50: 240, p90: 480 }, service: "ok", disclosure: null,
    notify: { available: phase !== "done", requested: false, sent: false },
  };
}

/** The demo's APIs: the challenge, one run that is asking for `livePolls` polls and then done, and the account request. */
async function routeDemo(page: Page, options: { phase?: "asking" | "done"; livePolls?: number } = {}) {
  const calls = { runs: [] as Record<string, unknown>[], signups: [] as Record<string, unknown>[], polls: 0 };
  await page.route("**/api/demo/challenge", route => route.fulfill({ json: intro() }));
  await page.route("**/api/demo/runs", route => {
    calls.runs.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: runId, token: runToken } });
  });
  await page.route(`**/api/demo/runs/${runId}`, route => {
    calls.polls++;
    const phase = options.phase ?? (calls.polls > (options.livePolls ?? 2) ? "done" : "asking");
    return route.fulfill({ json: runView(phase) });
  });
  await page.route(`**/api/demo/runs/${runId}/signup`, route => {
    calls.signups.push(route.request().postDataJSON());
    return route.fulfill({ json: { sent: true } });
  });
  return calls;
}

async function routeSignup(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/evals/v1/signup", route => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (!("password" in body)) return route.fulfill({ json: { data: { email: "ana@acme.example", workspaceName: "Acme", locale: "en" } } });
    return route.fulfill({ json: { data: { email: "ana@acme.example", orgId: id, evaluationId: null } } });
  });
  await page.route("**/api/auth/sign-in/email", route => route.fulfill({ json: { user: { id: "ana" }, token: "test-session" } }));
  return bodies;
}

/** axe at rest: reduced motion for the check, so scroll-driven reveals below the fold are not measured half-faded. */
async function expectAxeClean(page: Page, label: string, options: { include?: string; exclude?: string[] } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await seriousAxeViolations(page, options), `axe: ${label}`).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

/* ------------------------------------------------------------ the twelve --- */

test("axe: the landing in English and Spanish", async ({ page }) => {
  for (const locale of ["en", "es"]) {
    await page.goto(`/${locale}`);
    await expect(page.locator("h1").first()).toBeVisible();
    await expectAxeClean(page, `landing ${locale}`);
  }
});

test("axe: the demo's start, live and report views", async ({ page }) => {
  await routeDemo(page, { phase: "asking" });
  await page.goto("/en/demo");
  await expect(page.getByLabel("Your assistant")).toBeVisible();
  await expectAxeClean(page, "demo start");

  await page.goto(`/en/demo#r=${runId}.${runToken}`);
  await expect(page.getByRole("heading", { name: "Testing example.test" })).toBeVisible();
  await expectAxeClean(page, "demo live");

  await page.unrouteAll();
  await routeDemo(page, { phase: "done" });
  await page.goto(`/es/demo#r=${runId}.${runToken}`);
  await expect(page.locator(".dm-score")).toBeVisible();
  await page.locator(".dm-detail summary").first().click();
  await expectAxeClean(page, "demo report (es)");
});

test("axe: sign-up from the demo, direct sign-up and sign-in", async ({ page }) => {
  await routeSignup(page);
  await page.goto(`/workspace/signup#${signupToken}`);
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expectAxeClean(page, "sign-up");
  await page.goto("/workspace/start");
  await expect(page.getByLabel("Work email")).toBeVisible();
  await expectAxeClean(page, "direct sign-up");
  await page.goto("/workspace/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expectAxeClean(page, "sign-in");
});

test("axe: evaluations list, new evaluation and the evaluation page (running and paused for credits)", async ({ page }) => {
  await routeBilling(page, { runStatus: "running" });
  await page.goto(`/workspace/evaluations?owner&billing&orgId=${id}`);
  await expect(page.getByText("Claims assistant review").first()).toBeVisible();
  await expectAxeClean(page, "evaluations list");

  await page.goto(`/workspace/evaluations/new?owner&billing&orgId=${id}`);
  await expect(page.locator("h1").first()).toBeVisible();
  await expectAxeClean(page, "new evaluation");

  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await expect(page.locator(".p-pipeline").first()).toBeVisible();
  await expectAxeClean(page, "evaluation page, running");

  await page.unrouteAll();
  await routeBilling(page, { available: 0, runStatus: "paused", runReason: "credits_exhausted" });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await expect(page.getByRole("heading", { name: "Paused — add credits to continue" })).toBeVisible();
  // The run pipeline's upcoming stages included (L-15 left them out for L-24).
  await expectAxeClean(page, "evaluation page, paused for credits");
});

test("axe: the report's overview and test results", async ({ page }) => {
  await page.goto("/workspace/reports/fixture-v2");
  await expect(page.locator("h1").first()).toBeVisible();
  await expectAxeClean(page, "report overview");
  await page.goto("/workspace/reports/fixture-v2?tab=results&result=c3");
  await expect(page.getByText("Comisión de gestión").first()).toBeVisible();
  await expectAxeClean(page, "report results with a failed answer open");
});

test("axe: billing and usage, top up, and the estimate and top-up dialogs", async ({ page }) => {
  await routeBilling(page, { available: 120, estimate: { balance: { billingMode: "credits", requiresCredits: true, availableCredits: "120", coversP90: false, addCredits: "220" },
    gate: { enforced: true, autoRechargeCovers: false, autoRechargePackCredits: null, canStart: false } } });
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing`);
  await expect(page.getByTestId("workspace-billing")).toBeVisible();
  await expectAxeClean(page, "billing overview");
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing&view=top-up`);
  await expect(page.getByRole("heading", { name: "Choose a pack" })).toBeVisible();
  await expectAxeClean(page, "billing top up");
  await page.goto(`/workspace/billing/top-up?owner&billing&orgId=${id}`);
  await expect(page.getByRole("radio").first()).toBeVisible();
  await expectAxeClean(page, "top-up page");

  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(page.getByRole("dialog", { name: "Start this run?" })).toBeVisible();
  await expectAxeClean(page, "estimate dialog");
  await page.getByTestId("estimate-add-credits").click();
  await expect(page.getByRole("dialog", { name: "Buy credits" })).toBeVisible();
  await expectAxeClean(page, "top-up dialog");
});

/* --------------------------------------------- dialogs, live, motion --- */

test("dialogs take focus, keep it inside and give it back on Escape", async ({ page }) => {
  await routeBilling(page);
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  const trigger = page.getByRole("button", { name: "Run evaluation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Start this run?" });
  await expect(dialog).toBeVisible();
  const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
  expect(await inside(), "focus moves into the dialog").toBe(true);
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press(step % 3 === 2 ? "Shift+Tab" : "Tab");
    expect(await inside(), `focus stays inside after ${step + 1} Tab presses`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the public menu on a phone loads on first use, keeps focus inside and gives it back on Escape", async ({ page }) => {
  // Launch L-24b: the sheet behind the header's menu button is loaded when the button is first used.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [locale, name, sectors] of [["en", "Toggle menu", "Sectors"], ["es", "Abrir menú", "Sectores"]] as const) {
    await page.goto(`/${locale}`);
    const button = page.getByRole("button", { name });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("dialog", { name: "Caudals" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: sectors })).toBeVisible();
    // The open dialog hides the rest of the page from assistive technology, the button included.
    await expect(page.getByRole("button", { name, includeHidden: true })).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]"))), "focus moves into the menu").toBe(true);
    await expectAxeClean(page, `mobile menu ${locale}`);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  }
});

test("progress is announced: the demo's live steps and the evaluation's run", async ({ page }) => {
  await routeDemo(page, { phase: "asking" });
  await page.goto(`/en/demo#r=${runId}.${runToken}`);
  const demoLive = page.locator("[aria-live=polite]").filter({ hasText: /^Ask your assistant/ });
  await expect(demoLive).toHaveText("Ask your assistant: 3 of 8 answered");

  await page.unrouteAll();
  await routeBilling(page, { runStatus: "running" });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  const progress = page.locator(".p-pipeline").first();
  await expect(progress).toBeVisible();
  // The pipeline sits in a polite live region, and each stage's bar is a progressbar with its value.
  expect(await progress.evaluate((node) => node.closest("[aria-live]")?.getAttribute("aria-live") ?? null), "the run's progress is announced").toBe("polite");
  const bar = progress.getByRole("progressbar").first();
  await expect(bar).toHaveAttribute("aria-valuenow", "4");
  await expect(bar).toHaveAttribute("aria-valuemax", "10");
});

test("nothing moves under reduced motion on the landing, the demo and the evaluation page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const moving = () => page.evaluate(() => document.getAnimations()
    .filter((animation) => {
      const frames = (animation.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
      return frames.some((frame) => ["transform", "translate", "scale", "rotate"].some((key) => frame[key] && frame[key] !== "none"));
    })
    .map((animation) => (animation as CSSAnimation).animationName ?? "transition"));
  await page.goto("/en");
  await expect(page.locator("h1").first()).toBeVisible();
  expect(await moving(), "landing").toEqual([]);
  await routeDemo(page, { phase: "asking" });
  await page.goto("/en/demo");
  await expect(page.getByLabel("Your assistant")).toBeVisible();
  expect(await moving(), "demo start").toEqual([]);
  await page.goto(`/en/demo#r=${runId}.${runToken}`);
  await expect(page.getByRole("heading", { name: "Testing example.test" })).toBeVisible();
  expect(await moving(), "demo live").toEqual([]);
  await page.unrouteAll();
  await routeBilling(page, { runStatus: "running" });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await expect(page.locator(".p-pipeline").first()).toBeVisible();
  expect(await moving(), "evaluation page").toEqual([]);
});

/* ------------------------------------------------- keyboard-only funnel --- */

/**
 * Presses Tab until the focused element matches, failing after `max` presses.
 * Keyboard only. The reached element must show focus: its own outline, ring,
 * border or background, or its field's (a bar that styles :focus-within),
 * compared with the same element unfocused.
 */
async function tabTo(page: Page, matches: (element: { tag: string; type: string | null; name: string; label: string; href: string | null }) => boolean, max = 80) {
  for (let press = 0; press < max; press++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const labelled = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent ?? "" : "";
      return {
        tag: element.tagName.toLowerCase(), type: element.getAttribute("type"), name: (element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/\s+/g, " ").trim(),
        label: labelled.replace(/\s+/g, " ").trim(), href: element.getAttribute("href"),
      };
    });
    if (focused && matches(focused)) {
      const shown = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        const chain = [element, element.parentElement, element.parentElement?.parentElement].filter((node): node is HTMLElement => Boolean(node));
        const settle = () => document.getAnimations().forEach((animation) => { try { animation.finish(); } catch { /* infinite */ } });
        const look = () => chain.map((node) => {
          const style = getComputedStyle(node);
          return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderTopColor, style.borderBottomColor, style.backgroundColor].join("|");
        });
        settle();
        const withFocus = look();
        element.blur();
        settle();
        const without = look();
        element.focus();
        settle();
        return withFocus.some((value, index) => value !== without[index]);
      });
      expect(shown, `a visible focus indicator on ${focused.tag} "${focused.name || focused.label}"`).toBe(true);
      return;
    }
  }
  throw new Error(`no matching element within ${max} Tab presses`);
}

test("the funnel works with the keyboard only: landing → demo → report → sign-up", async ({ page }) => {
  const demo = await routeDemo(page, { livePolls: 2 });
  const signups = await routeSignup(page);
  await page.goto("/en");
  await expect(page.locator("h1").first()).toBeVisible();

  // Landing: the hero's free test.
  await tabTo(page, (element) => element.tag === "a" && /\/en\/demo$/.test(element.href ?? "") && element.name.startsWith("Test your assistant free"));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/en\/demo$/);

  // Demo: paste a site and press Enter.
  await tabTo(page, (element) => element.tag === "textarea" && element.label === "Your assistant");
  await page.keyboard.type("example.test");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Testing example.test" })).toBeVisible();
  expect(demo.runs).toHaveLength(1);
  expect(demo.runs[0]).toMatchObject({ target: "example.test", locale: "en", nonce: expect.any(String) });

  // Report: open the first answer, then create the account.
  await expect(page.locator(".dm-score")).toBeVisible({ timeout: 15_000 });
  await tabTo(page, (element) => element.tag === "summary" && element.name.includes("Question 1"));
  await page.keyboard.press("Enter");
  await expect(page.locator(".dm-detail").first()).toHaveAttribute("open", "");
  await tabTo(page, (element) => element.tag === "input" && element.label === "Work email");
  await page.keyboard.type("ana@acme.example");
  await tabTo(page, (element) => element.tag === "button" && element.name.startsWith("Create free account"), 6);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Check your inbox" })).toBeVisible();
  expect(demo.signups).toEqual([{ email: "ana@acme.example" }]);

  // Sign-up: the emailed link.
  await page.goto(`/workspace/signup#${signupToken}`);
  await expect(page.getByLabel("Full name")).toBeVisible();
  await tabTo(page, (element) => element.tag === "input" && element.label === "Full name");
  await page.keyboard.type("Ana Pérez");
  await tabTo(page, (element) => element.tag === "input" && element.label.startsWith("Password"), 4);
  await page.keyboard.type("a-long-password-1");
  // Tab to the Terms checkbox and tick it with Space.
  await tabTo(page, (element) => element.tag === "input" && element.type === "checkbox", 6);
  const terms = page.getByRole("checkbox", { name: /I accept/ });
  await expect(terms).toBeFocused();
  await page.keyboard.press("Space");
  await expect(terms).toBeChecked();
  await tabTo(page, (element) => element.tag === "button" && element.name === "Create account", 6);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workspace\/evaluations\?orgId=/);
  expect(signups.at(-1)).toMatchObject({ token: signupToken, name: "Ana Pérez", acceptTerms: true });
});
