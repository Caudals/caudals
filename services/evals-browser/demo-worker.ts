import { randomUUID } from "node:crypto";
import type { Browser, FrameLocator, Page } from "playwright";
import type { Pool } from "pg";
import { detectChatControls, probeChatReply, recipeFromDetection, type DetectedConnector } from "../../lib/evals/connectors/browser-autodetect";
import { browserLocator, dismissConsent, guardBrowserContext, invokeWebsite, loginRequired } from "../../lib/evals/connectors/browser-executor";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import type { BrowserLocator, WebsiteRecipe } from "../../lib/evals/contracts/browser";
import { turnAnswer } from "../../lib/evals/scoring/answer-judge";
import { aiDisclosureCheckEnabled, disclosureTurn, OPENING_MESSAGE, PERSON_QUESTION, type DisclosureTurn } from "../../lib/evals/scoring/disclosure";
import { rankLinks, type DemoPage } from "../../lib/demo/web";

/**
 * The public demo's website work (lib/demo/runner.ts does the rest): reading
 * pages that only render in a browser, and asking a site's chat widget the
 * generated questions, each in a fresh browser context. Detection starts as
 * soon as the run exists, so the chat is ready by the time questions are.
 * Same egress proxy and destination checks as every other browser job.
 */

type DemoJob = {
  id: string;
  phase: string;
  locale: "en" | "es";
  language: "en" | "es" | null;
  target_url: string;
  docs_url: string;
  browser_docs: string | null;
  browser_chat: string | null;
};
type DemoCase = { id: string; question: string };
type Check = (url: string) => Promise<void>;

/** Questions asked at once. One keeps the demo light beside customer browser jobs. */
const PARALLEL_QUESTIONS = Math.max(1, Math.min(3, Number(process.env.EVALS_BROWSER_DEMO_PARALLEL ?? 1) || 1));
/** Demos handled at once; the app admits at most DEMO_MAX_ACTIVE_WEBSITE website runs, which should match. */
const CONCURRENT_DEMOS = Math.max(1, Math.min(3, Number(process.env.EVALS_BROWSER_DEMO_CONCURRENCY ?? 1) || 1));

/** The app sent the run back to its queue (no model could serve it): hand the job back too. */
class Requeued extends Error {}

/**
 * Runs beside the platform's browser slot rather than inside it, so a demo
 * never holds up a customer's evaluation. It serves runs the app has admitted
 * from its queue, oldest first, up to EVALS_BROWSER_DEMO_CONCURRENCY at once.
 */
export function startDemoBrowserWorker(options: { pool: Pool; browser: Browser; destinationCheck: Check }) {
  let active = 0;
  let claiming = false;
  const tick = async () => {
    if (claiming || active >= CONCURRENT_DEMOS) return;
    claiming = true;
    let job: DemoJob | null = null;
    try {
      job = await claim(options.pool);
    } catch (error) {
      // Database error codes and names only; never page content or URLs.
      console.error(JSON.stringify({ event: "demo_browser_tick_failed", code: (error as { code?: string })?.code ?? null, type: error instanceof Error ? error.name : typeof error }));
    } finally {
      claiming = false;
    }
    if (!job) return;
    active++;
    void run(options, job)
      .catch((error) => console.error(JSON.stringify({ event: "demo_browser_job_failed", code: (error as { code?: string })?.code ?? null, type: error instanceof Error ? error.name : typeof error })))
      .finally(() => { active--; });
  };
  const timer = setInterval(() => void tick(), 2_000);
  return () => clearInterval(timer);
}

/** Admitted runs only: a run waiting in the app's queue (started_at NULL) is not served yet. */
async function claim(pool: Pool): Promise<DemoJob | null> {
  const { rows } = await pool.query<DemoJob>(
    `UPDATE demo.run SET browser_lease_until = now() + interval '90 seconds',
       browser_docs = CASE WHEN browser_docs IN ('queued','running') THEN 'running' ELSE browser_docs END,
       browser_chat = CASE WHEN browser_chat IN ('queued','running') THEN 'running' ELSE browser_chat END,
       version = version + 1, updated_at = now()
     WHERE id = (SELECT id FROM demo.run
       WHERE expires_at > now() AND phase NOT IN ('done','failed') AND (started_at IS NOT NULL OR queued_at IS NULL)
         AND (browser_docs IN ('queued','running') OR browser_chat IN ('queued','running'))
         AND (browser_lease_until IS NULL OR browser_lease_until < now())
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, phase, locale, language, target_url, docs_url, browser_docs, browser_chat`,
  );
  return rows[0] ?? null;
}

async function run(options: { pool: Pool; browser: Browser; destinationCheck: Check }, job: DemoJob) {
  const { pool } = options;
  const lease = setInterval(() => void pool.query("UPDATE demo.run SET browser_lease_until = now() + interval '90 seconds' WHERE id = $1", [job.id]).catch(() => {}), 30_000);
  // The browser role may write browser_error but not read it, so it is only ever set, never merged.
  const set = (column: "browser_docs" | "browser_chat", value: string, error?: string) => error
    ? pool.query(`UPDATE demo.run SET ${column} = $2, browser_error = $3, version = version + 1, updated_at = now() WHERE id = $1`, [job.id, value, error])
    : pool.query(`UPDATE demo.run SET ${column} = $2, version = version + 1, updated_at = now() WHERE id = $1`, [job.id, value]);
  try {
    if (job.browser_docs === "running") await docs(options, job);
    if (job.browser_chat === "running") {
      try {
        await askChat(options, job);
        await set("browser_chat", "done");
      } catch (error) {
        if (error instanceof Requeued) {
          // Picked up again, from detection, once the app admits the run anew.
          await pool.query("UPDATE demo.run SET browser_chat = 'queued', browser_lease_until = NULL, version = version + 1, updated_at = now() WHERE id = $1 AND browser_chat = 'running'", [job.id]);
        } else {
          await set("browser_chat", "failed", code(error, "chat_not_found"));
        }
      }
    }
  } finally {
    clearInterval(lease);
  }
}

async function docs(options: { pool: Pool; browser: Browser; destinationCheck: Check }, job: DemoJob) {
  try {
    const pages = await readPages(options.browser, job.docs_url, options.destinationCheck);
    await options.pool.query("UPDATE demo.run SET browser_pages = $2::jsonb, browser_docs = 'done', version = version + 1, updated_at = now() WHERE id = $1", [job.id, JSON.stringify(pages)]);
  } catch (error) {
    await options.pool.query("UPDATE demo.run SET browser_docs = 'failed', browser_error = $2, version = version + 1, updated_at = now() WHERE id = $1", [job.id, code(error, "site_unreadable")]);
  }
}

function code(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]{1,64}$/.test(message) ? message : fallback;
}

/* ----------------------------------------------------------------- pages --- */

async function readPages(browser: Browser, start: string, check: Check): Promise<DemoPage[]> {
  await check(start);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: false, serviceWorkers: "block" });
  try {
    await guardBrowserContext(context, check);
    await context.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|webm)(\?|$)/i, (route) => route.abort());
    const page = await context.newPage();
    const read = async (url: string) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
      await dismissConsent(page);
      return page.evaluate(() => ({
        title: document.title,
        url: location.href,
        text: (document.querySelector("main")?.textContent?.trim().length ?? 0) > 400 ? (document.querySelector("main") as HTMLElement).innerText : document.body?.innerText ?? "",
        links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).slice(0, 300).map((a) => ({ url: a.href, label: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 120) })),
      }));
    };
    const home = await read(start);
    const pages: DemoPage[] = [];
    const clean = (text: string) => text.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 2).join("\n").slice(0, 40_000);
    if (clean(home.text).length > 200) pages.push({ url: home.url, title: home.title.slice(0, 160), text: clean(home.text) });
    const deadline = Date.now() + 70_000;
    for (const href of rankLinks(home.links, new URL(home.url), 8)) {
      if (pages.length >= 6 || Date.now() > deadline) break;
      try {
        const next = await read(href);
        const text = clean(next.text);
        if (text.length >= 300 && !pages.some((item) => item.url === next.url || item.text === text)) pages.push({ url: next.url, title: next.title.slice(0, 160), text });
      } catch { /* skip the page */ }
    }
    if (!pages.length) throw new Error("site_empty");
    return pages;
  } finally {
    await context.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ chat --- */

/** What detection saw: the recipe, plus the chat's greeting and its reply to our opening (for the AI-disclosure check). */
export type Detection = { recipe: WebsiteRecipe; greeting: string; reply: string };

function partLocator(page: Page, value: BrowserLocator) {
  let root: Page | FrameLocator = page;
  for (const frame of value.frames ?? []) root = browserLocator(root, frame).contentFrame();
  return browserLocator(root, value);
}

/**
 * The chat's own messages before our opening: every assistant message the
 * reply locator finds, except the last one (the reply). Best effort; bounded.
 */
async function greetingOf(page: Page, detected: DetectedConnector): Promise<string> {
  try {
    const texts = (await partLocator(page, detected.response.locator).allInnerTexts()).map((text) => text.trim()).filter(Boolean);
    return texts.slice(0, -1).slice(-4).join("\n").slice(0, 1_500);
  } catch {
    return "";
  }
}

/** Finds the chat and learns its recipe; exported for the browser fixture contracts. */
export async function detect(browser: Browser, url: string, check: Check, language: "en" | "es"): Promise<Detection> {
  await check(url);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: "block" });
  try {
    await guardBrowserContext(context, check);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    await dismissConsent(page);
    let controls;
    try { controls = await detectChatControls(page); }
    catch (error) { if (await loginRequired(page, url)) throw new Error("login_required"); throw error; }
    const detected = await probeChatReply(page, controls, { prompt: OPENING_MESSAGE[language] });
    const recipe = recipeFromDetection(detected, page.url(), "known_recipe", randomUUID());
    // The demo accepts a reply judged complete by quiet text and network,
    // which is what a stable-text recipe would wait for anyway.
    if (recipe.completion.kind === "text_stable") recipe.completion = { kind: "quiescent", quiet_ms: 3_000 };
    return { recipe: withContentHash(recipe) as WebsiteRecipe, greeting: await greetingOf(page, detected), reply: detected.reply };
  } finally {
    await context.close().catch(() => {});
  }
}

async function askChat(options: { pool: Pool; browser: Browser; destinationCheck: Check }, job: DemoJob) {
  const { pool, browser, destinationCheck } = options;
  let detection: Detection | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !detection; attempt++) {
    try { detection = await detect(browser, job.target_url, destinationCheck, job.language ?? job.locale); }
    catch (error) { lastError = error; if (error instanceof Error && error.message === "login_required") break; }
  }
  if (!detection) throw lastError instanceof Error && /^(login_required|chat_input_not_found)$/.test(lastError.message) ? new Error(lastError.message === "chat_input_not_found" ? "chat_not_found" : "login_required") : new Error("chat_not_found");
  const recipe = detection.recipe;
  await pool.query("UPDATE demo.run SET target_config = jsonb_build_object('recipe_detected', true), version = version + 1, updated_at = now() WHERE id = $1", [job.id]);
  // While the engine writes the questions, the AI-disclosure check asks its one question.
  if (aiDisclosureCheckEnabled()) await askDisclosure(options, job, detection);

  const started = new Set<string>();
  const deadline = Date.now() + 9 * 60_000;
  const ask = async (item: DemoCase) => {
    const begin = Date.now();
    let text = "";
    let error: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const observation = await invokeWebsite({
          browser, recipe, destinationCheck,
          input: { schema_version: "1.0", case_id: item.id, case_revision_id: item.id, messages: [{ role: "user", content: item.question }], attachments: [], tools: [] },
          context: {
            run_id: job.id, target_revision_id: job.id, execution_plan_id: job.id, tenant_scope_handle: "demo", attempt_id: randomUUID(),
            deadline: new Date(Date.now() + 60_000).toISOString(), scoped_credential_handle: null, destination_policy_id: "demo",
            reserved_cost: { amount: "0", currency: "EUR" }, signal: AbortSignal.timeout(100_000),
          },
        });
        text = turnAnswer(observation).trim();
        error = null;
        if (text) break;
      } catch (caught) {
        error = code(caught, "capture_incomplete");
      }
    }
    await pool.query(
      "UPDATE demo.run SET answers = answers || jsonb_build_object($2::text, $3::jsonb), version = version + 1, updated_at = now() WHERE id = $1",
      [job.id, item.id, JSON.stringify({ text: text.slice(0, 6_000), ms: Date.now() - begin, error: text ? null : error ?? "no_reply" })],
    );
  };
  // Questions arrive while they are written; ask each as soon as it exists.
  while (Date.now() < deadline) {
    const { rows } = await pool.query<{ phase: string; cases: DemoCase[]; answers: Record<string, unknown>; browser_docs: string | null; waiting: boolean }>(
      "SELECT phase, cases, answers, browser_docs, (started_at IS NULL AND queued_at IS NOT NULL) AS waiting FROM demo.run WHERE id = $1", [job.id]);
    const row = rows[0];
    if (!row || row.phase === "failed" || row.phase === "done") return;
    if (row.waiting) throw new Requeued("requeued");
    // The engine asked for a browser read of the pages while this job held the run.
    if (row.browser_docs === "queued") { await docs(options, job); continue; }
    const waiting = row.cases.filter((item) => !row.answers[item.id] && !started.has(item.id));
    if (!waiting.length) {
      if (row.phase !== "reading" && row.phase !== "writing" && row.cases.every((item) => row.answers[item.id])) return;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      continue;
    }
    const batch = waiting.slice(0, PARALLEL_QUESTIONS);
    for (const item of batch) started.add(item.id);
    await Promise.all(batch.map(ask));
  }
}

/* --------------------------------------------------------- AI disclosure --- */

/**
 * The AI-disclosure check for a website (launch L-29), when the run asked for
 * it: the greeting and the reply to our opening come from detection; the one
 * ordinary question ("Am I talking to a person?") is asked in a fresh browser
 * context, like every demo question. The engine classifies the transcript
 * when the run finishes; a failure here is recorded, never fatal.
 */
async function askDisclosure(options: { pool: Pool; browser: Browser; destinationCheck: Check }, job: DemoJob, detection: Detection) {
  const { pool, browser, destinationCheck } = options;
  try {
    const { rows } = await pool.query<{ disclosure: { requested?: boolean; transcript?: unknown } | null }>("SELECT answers->'ai_disclosure' AS disclosure FROM demo.run WHERE id = $1", [job.id]);
    const state = rows[0]?.disclosure;
    if (state?.requested !== true || state.transcript) return;
    const language = job.language ?? job.locale;
    const question = PERSON_QUESTION[language];
    let answer = "";
    let error: string | null = null;
    try {
      const observation = await invokeWebsite({
        browser, recipe: detection.recipe, destinationCheck,
        input: { schema_version: "1.0", case_id: "ai-disclosure", case_revision_id: "ai-disclosure", messages: [{ role: "user", content: question }], attachments: [], tools: [] },
        context: {
          run_id: job.id, target_revision_id: job.id, execution_plan_id: job.id, tenant_scope_handle: "demo", attempt_id: randomUUID(),
          deadline: new Date(Date.now() + 60_000).toISOString(), scoped_credential_handle: null, destination_policy_id: "demo",
          reserved_cost: { amount: "0", currency: "EUR" }, signal: AbortSignal.timeout(100_000),
        },
      });
      answer = turnAnswer(observation).trim();
      if (!answer) error = "no_reply";
    } catch (caught) {
      error = code(caught, "capture_incomplete");
    }
    const transcript: DisclosureTurn[] = [
      ...(detection.greeting ? [disclosureTurn("greeting", detection.greeting)] : []),
      disclosureTurn("opening", OPENING_MESSAGE[language]),
      disclosureTurn("first_reply", detection.reply, detection.reply.trim() ? null : "no_reply"),
      disclosureTurn("person_question", question),
      disclosureTurn("person_answer", answer, error),
    ];
    await pool.query(
      `UPDATE demo.run SET answers = answers || jsonb_build_object('ai_disclosure', $2::jsonb), version = version + 1, updated_at = now()
       WHERE id = $1 AND phase IN ('reading','writing','asking')`,
      [job.id, JSON.stringify({ requested: true, language, transcript })],
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "demo_disclosure_capture_failed", code: (error as { code?: string })?.code ?? null, type: error instanceof Error ? error.name : typeof error }));
  }
}
