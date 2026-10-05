import { randomUUID } from "node:crypto";
import type { Browser } from "playwright";
import type { Pool } from "pg";
import { detectChatControls, probeChatReply, recipeFromDetection } from "../../lib/evals/connectors/browser-autodetect";
import { dismissConsent, guardBrowserContext, invokeWebsite, loginRequired } from "../../lib/evals/connectors/browser-executor";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import type { WebsiteRecipe } from "../../lib/evals/contracts/browser";
import { turnAnswer } from "../../lib/evals/scoring/answer-judge";
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

/**
 * Runs beside the platform's browser slot rather than inside it, so a demo
 * never holds up a customer's evaluation; it handles one demo at a time.
 */
export function startDemoBrowserWorker(options: { pool: Pool; browser: Browser; destinationCheck: Check }) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const job = await claim(options.pool);
      if (job) await run(options, job);
    } catch (error) {
      // Database error codes and names only; never page content or URLs.
      console.error(JSON.stringify({ event: "demo_browser_tick_failed", code: (error as { code?: string })?.code ?? null, type: error instanceof Error ? error.name : typeof error }));
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 2_000);
  return () => clearInterval(timer);
}

async function claim(pool: Pool): Promise<DemoJob | null> {
  const { rows } = await pool.query<DemoJob>(
    `UPDATE demo.run SET browser_lease_until = now() + interval '90 seconds',
       browser_docs = CASE WHEN browser_docs IN ('queued','running') THEN 'running' ELSE browser_docs END,
       browser_chat = CASE WHEN browser_chat IN ('queued','running') THEN 'running' ELSE browser_chat END,
       version = version + 1, updated_at = now()
     WHERE id = (SELECT id FROM demo.run
       WHERE expires_at > now() AND phase NOT IN ('done','failed') AND (browser_docs IN ('queued','running') OR browser_chat IN ('queued','running'))
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
        await set("browser_chat", "failed", code(error, "chat_not_found"));
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

async function detect(browser: Browser, url: string, check: Check, language: "en" | "es"): Promise<WebsiteRecipe> {
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
    const detected = await probeChatReply(page, controls, { prompt: language === "es" ? "Hola, ¿en qué me puedes ayudar?" : "Hi, what can you help me with?" });
    const recipe = recipeFromDetection(detected, page.url(), "known_recipe", randomUUID());
    // The demo accepts a reply judged complete by quiet text and network,
    // which is what a stable-text recipe would wait for anyway.
    if (recipe.completion.kind === "text_stable") recipe.completion = { kind: "quiescent", quiet_ms: 3_000 };
    return withContentHash(recipe) as WebsiteRecipe;
  } finally {
    await context.close().catch(() => {});
  }
}

async function askChat(options: { pool: Pool; browser: Browser; destinationCheck: Check }, job: DemoJob) {
  const { pool, browser, destinationCheck } = options;
  let recipe: WebsiteRecipe | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !recipe; attempt++) {
    try { recipe = await detect(browser, job.target_url, destinationCheck, job.language ?? job.locale); }
    catch (error) { lastError = error; if (error instanceof Error && error.message === "login_required") break; }
  }
  if (!recipe) throw lastError instanceof Error && /^(login_required|chat_input_not_found)$/.test(lastError.message) ? new Error(lastError.message === "chat_input_not_found" ? "chat_not_found" : "login_required") : new Error("chat_not_found");
  await pool.query("UPDATE demo.run SET target_config = jsonb_build_object('recipe_detected', true), version = version + 1, updated_at = now() WHERE id = $1", [job.id]);

  const started = new Set<string>();
  const deadline = Date.now() + 9 * 60_000;
  const ask = async (item: DemoCase) => {
    const begin = Date.now();
    let text = "";
    let error: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const observation = await invokeWebsite({
          browser, recipe: recipe!, destinationCheck,
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
    const { rows } = await pool.query<{ phase: string; cases: DemoCase[]; answers: Record<string, unknown>; browser_docs: string | null }>("SELECT phase, cases, answers, browser_docs FROM demo.run WHERE id = $1", [job.id]);
    const row = rows[0];
    if (!row || row.phase === "failed" || row.phase === "done") return;
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
