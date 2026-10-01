import { randomUUID } from "node:crypto";
import type {
  Browser,
  BrowserContext,
  Frame,
  FrameLocator,
  Locator,
  Page,
} from "playwright";
import type { CandidateInput } from "../contracts/projections";
import type { InvocationContext } from "../contracts/connectors";
import {
  browserDiscoverySnapshotSchema,
  browserProbeEvidenceSchema,
  scopedBrowserStorageState,
  websiteTeachExtension,
  type BrowserDiscoverySnapshot,
  type BrowserLocator,
  type BrowserProbeEvidence,
  type WebsiteRecipe,
  type BrowserStorageState,
} from "../contracts/browser";
import { observationSchema } from "../contracts/results";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import { validatePublicDestination, type Lookup } from "./egress";

type FrameLike = Page | Frame | FrameLocator;
type DestinationCheck = (url: string) => Promise<void>;

export function browserLocator(root: FrameLike, value: BrowserLocator): Locator {
  if (value.kind === "role") {
    return root.getByRole(value.role, value.name ? { name: value.name, exact: true } : undefined);
  }
  if (value.kind === "label") return root.getByLabel(value.text, { exact: true });
  if (value.kind === "test_id") return root.getByTestId(value.value);
  return root.locator(value.value);
}

function scopedRoot(page: FrameLike, frames: BrowserLocator[]): FrameLike {
  let root = page;
  for (const frame of frames) root = browserLocator(root, frame).contentFrame();
  return root;
}
function locator(page: FrameLike, recipe: Pick<WebsiteRecipe, "frame_chain">, value: BrowserLocator): Locator {
  return browserLocator(scopedRoot(page, value.frames ?? recipe.frame_chain ?? []), value);
}
async function recipeRoot(page: Page, _recipe: WebsiteRecipe): Promise<FrameLike> { return page; }

// Repository-owned page scripts; see browser-locators.ts for why these are
// built from strings rather than serialized TypeScript callbacks.
const innerTexts = new Function("els", "return els.map(el => (el.innerText || el.textContent || ''))") as (elements: Element[]) => string[];

type Part = "launcher" | "input" | "submit" | "assistant_message";
function partOptions(recipe: WebsiteRecipe, part: Part, primary: BrowserLocator) {
  return [primary, ...(websiteTeachExtension(recipe)?.alternates?.[part] ?? [])];
}

/** The first locator (primary, then recorded fallbacks) that resolves to one visible element. */
async function resolvePart(root: FrameLike, recipe: WebsiteRecipe, part: Part, primary: BrowserLocator, timeoutMs: number) {
  const options = partOptions(recipe, part, primary);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const value of options) {
      const match = locator(root, recipe, value);
      if ((await match.count().catch(() => 0)) === 1 && (await match.isVisible().catch(() => false))) return match;
    }
    if (Date.now() >= deadline) throw new Error("selector_unavailable");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function textSnapshot(root: FrameLike, recipe: WebsiteRecipe) {
  const read = (value: BrowserLocator) => locator(root, recipe, value).evaluateAll(innerTexts)
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
  const primary = await read(recipe.assistant_message);
  if (primary.length) return primary;
  // A reply locator that matches nothing may have drifted; recorded
  // fallbacks keep the run going when they still find the messages.
  for (const value of websiteTeachExtension(recipe)?.alternates?.assistant_message ?? []) {
    const values = await read(value).catch(() => [] as string[]);
    if (values.length) return values;
  }
  return primary;
}

export function newAssistantMessages(previous: string[], current: string[]) {
  const samePrefix = previous.every((value, index) => current[index] === value);
  const messages = samePrefix ? current.slice(previous.length) : current;
  return { messages, duplicateFree: new Set(messages).size === messages.length };
}

/** Network and WebSocket activity, so completion never relies on text stability alone. */
export type PageActivity = { inflight(): number; lastActivity(): number; mark(): void; dispose(): void };
export function trackPageActivity(page: Page): PageActivity {
  const streaming = new Set(["fetch", "xhr", "eventsource", "other"]);
  const pending = new Map<object, number>();
  let since = 0, last = Date.now();
  const touch = () => { last = Date.now(); };
  const onRequest = (request: import("playwright").Request) => {
    if (!streaming.has(request.resourceType())) return;
    pending.set(request, Date.now()); touch();
  };
  const onDone = (request: import("playwright").Request) => { if (pending.delete(request)) touch(); };
  const onSocket = (socket: import("playwright").WebSocket) => { socket.on("framereceived", touch); socket.on("framesent", touch); };
  page.on("request", onRequest); page.on("requestfinished", onDone); page.on("requestfailed", onDone); page.on("websocket", onSocket);
  return {
    // Only requests started after the prompt count, and a request open for
    // more than a minute is a long poll or a notification channel.
    inflight: () => [...pending.values()].filter((started) => started >= since && Date.now() - started < 60_000).length,
    lastActivity: () => last,
    mark: () => { since = Date.now(); touch(); },
    dispose: () => { page.off("request", onRequest); page.off("requestfinished", onDone); page.off("requestfailed", onDone); page.off("websocket", onSocket); },
  };
}

export async function waitForCompletion(
  root: FrameLike,
  recipe: WebsiteRecipe,
  previous: string[],
  deadline: number,
  activity?: PageActivity,
) {
  let candidate = "";
  let changedAt = 0;
  let prior = "";
  let busySeen = false;
  const stableFor =
    recipe.completion.kind === "text_stable" ? recipe.completion.stable_ms
      : recipe.completion.kind === "quiescent" ? recipe.completion.quiet_ms : 500;
  const networkQuiet = (ms: number) => !activity || (activity.inflight() === 0 && Date.now() - activity.lastActivity() >= ms);
  while (Date.now() < deadline) {
    // Read the completion signal before the text: a widget that swaps in the
    // final answer and clears its busy state together must not yield the
    // partial text captured just before the swap.
    let signalReady = true;
    let signalMissed = false;
    if (recipe.completion.kind === "selector_hidden") {
      const visible = await locator(root, recipe, recipe.completion.locator)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) busySeen = true;
      signalReady = busySeen && !visible;
      signalMissed = !busySeen && !visible;
    } else if (recipe.completion.kind === "send_enabled") {
      const enabled = await locator(root, recipe, recipe.completion.locator)
        .first()
        .isEnabled()
        .catch(() => false);
      if (!enabled) busySeen = true;
      signalReady = busySeen && enabled;
      // Some apps keep Send disabled while the input is empty.
      signalMissed = busySeen && !enabled;
    }
    const messages = await textSnapshot(root, recipe);
    const fresh = newAssistantMessages(previous, messages);
    candidate =
      recipe.assistant_extraction === "last_new_message"
        ? fresh.messages.at(-1) ?? ""
        : messages.at(-1) ?? "";
    if (candidate && candidate !== prior) {
      prior = candidate;
      changedAt = Date.now();
    }
    const quietFor = changedAt ? Date.now() - changedAt : 0;
    if (candidate && changedAt) {
      if (recipe.completion.kind === "quiescent") {
        if (quietFor >= stableFor && networkQuiet(Math.min(stableFor, 1_000))) return candidate;
        // A connection held open by the page never blocks a long-settled reply.
        if (quietFor >= Math.max(stableFor * 4, 8_000)) return candidate;
      } else if (signalReady && quietFor >= stableFor) {
        return candidate;
      } else if (signalMissed && activity && quietFor >= 5_000 && networkQuiet(2_000)) {
        // A signal too brief to observe (or Send left disabled by an empty
        // input) falls back to a long, network-confirmed quiet period.
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("capture_incomplete");
}

/** Types a prompt the way a person would and submits it. */
export async function sendWebsitePrompt(
  root: FrameLike,
  parts: { input: BrowserLocator; submit: BrowserLocator | null; frame_chain?: BrowserLocator[] },
  prompt: string,
  resolved?: { input?: Locator; submit?: Locator | null },
) {
  const recipe = { frame_chain: parts.frame_chain ?? [] };
  const input = resolved?.input ?? locator(root, recipe, parts.input).first();
  const page = input.page();
  await input.click({ timeout: 10_000 }).catch(() => input.focus({ timeout: 5_000 }));
  const editable = await input.evaluate(new Function("el", "return el.isContentEditable && !('value' in el)") as (element: Element) => boolean);
  const read = new Function("el", "return ('value' in el ? el.value : el.innerText) || ''") as (element: Element) => string;
  if (editable) {
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(prompt);
  } else {
    await input.fill(prompt);
  }
  const head = prompt.trim().slice(0, 24);
  if (!(await input.evaluate(read)).includes(head)) {
    // Editors that ignore programmatic input still accept real keystrokes.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await input.pressSequentially(prompt, { delay: 2 });
  }
  if (!parts.submit) { await input.press("Enter"); return; }
  const submit = resolved?.submit ?? locator(root, recipe, parts.submit).first();
  // Send buttons usually enable a moment after the input event.
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && !(await submit.isEnabled().catch(() => true))) await new Promise((resolve) => setTimeout(resolve, 100));
  await submit.click({ timeout: 10_000 });
}

/** Distinguishes an expired login from a changed chat UI after a page load. */
export async function loginRequired(page: Page, startUrl: string) {
  const current = new URL(page.url());
  if (current.origin !== new URL(startUrl).origin) return true;
  if (/(^|\/)(log-?in|sign-?in|signin|auth|sso|oauth|session|account\/login|accounts)(\/|$|\?)/i.test(current.pathname)) return true;
  for (const frame of page.frames()) {
    if (await frame.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;
  }
  return false;
}

export function assertScorableWebsiteRecipe(recipe: WebsiteRecipe) {
  if (recipe.completion.kind === "text_stable") {
    throw new Error("website_completion_unverified");
  }
}

export async function guardBrowserContext(
  context: BrowserContext,
  check: DestinationCheck,
) {
  await context.routeWebSocket("**/*", async (socket) => {
    try {
      const destination = new URL(socket.url());
      if (destination.protocol !== "wss:") throw new Error("destination_invalid");
      destination.protocol = "https:";
      await check(destination.toString());
      socket.connectToServer();
    } catch {
      socket.close();
    }
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    try {
      if (new URL(url).protocol !== "https:") throw new Error("destination_invalid");
      await check(url);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

export async function restoreBrowserSessionStorage(context: BrowserContext, state?: BrowserStorageState) {
  if (!state?.session_storage?.length) return;
  await context.addInitScript({ content: `(() => { const states=${JSON.stringify(state.session_storage)};const state=states.find(item=>item.origin===location.origin);if(state)for(const item of state.entries)sessionStorage.setItem(item.name,item.value); })()` });
}

export async function discoverWebsite(args: {
  browser: Browser;
  url: string;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
  /** Receives a viewport-only JPEG with every input masked, for operator assistance. */
  onScreenshot?: (bytes: Buffer) => void;
}): Promise<BrowserDiscoverySnapshot> {
  await args.destinationCheck(args.url);
  const context = await args.browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  try {
    await guardBrowserContext(context, args.destinationCheck);

    const page = await context.newPage();
    await page.goto(args.url, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(args.timeoutMs ?? 30_000, 60_000),
    });
    // Keep this as browser-native JavaScript. The production tsx loader adds
    // helper references to serialized function callbacks that do not exist in
    // Chromium's page context.
    const snapshot = await page.evaluate(`(() => {
      const describe = (element) => {
        const html = element;
        return [
          element.tagName.toLocaleLowerCase(),
          element.getAttribute("role"),
          element.getAttribute("aria-label"),
          element.getAttribute("data-testid"),
          element.id,
          html.innerText?.trim().slice(0, 120),
        ]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 500);
      };
      const all = (selector, limit = 25) =>
        Array.from(document.querySelectorAll(selector)).slice(0, limit).map(describe);
      const text = document.body?.innerText?.toLocaleLowerCase() ?? "";
      const html = document.documentElement.innerHTML.toLocaleLowerCase();
      return {
        url: location.href,
        title: document.title,
        provider_hint:
          ["intercom", "drift", "zendesk", "crisp", "salesforce"].find((name) =>
            html.includes(name),
          ) ?? null,
        launchers: all(
          'button,[role="button"],[aria-label*="chat" i],[data-testid*="chat" i]',
        ),
        text_inputs: all(
          'textarea,input[type="text"],[contenteditable="true"],[role="textbox"]',
        ),
        message_regions: all(
          '[role="log"],[aria-live],[data-testid*="message" i],[class*="message" i]',
        ),
        frames: all("iframe", 20),
        has_closed_shadow_hint: all("*")
          .slice(0, 200)
          .some((description) => description.includes("shadow")),
        has_captcha: /captcha|verify you are human|cloudflare challenge/.test(text),
      };
    })()`);
    if (args.onScreenshot) {
      try {
        await page.setViewportSize({ width: 1024, height: 768 });
        const bytes = await page.screenshot({
          type: "jpeg", quality: 45, fullPage: false, timeout: 10_000,
          mask: [page.locator('input, textarea, [contenteditable="true"], [role="textbox"]')],
        });
        if (bytes.length <= 400_000) args.onScreenshot(bytes);
      } catch {
        // Evidence is best effort; discovery must not fail because a capture did.
      }
    }
    return browserDiscoverySnapshotSchema.parse(snapshot);
  } finally {
    await context.close();
  }
}

export function knownRecipeProposal(
  snapshot: BrowserDiscoverySnapshot,
  recipeRevisionId = randomUUID(),
): Omit<WebsiteRecipe, "content_hash"> | null {
  if (snapshot.has_captcha || !snapshot.text_inputs.length) return null;
  const common = {
    schema_version: "1.0" as const,
    recipe_revision_id: recipeRevisionId,
    source: "known_recipe" as const,
    start_url: snapshot.url,
    frame_chain: [] as BrowserLocator[],
    input: { kind: "role" as const, role: "textbox" as const, name: null },
    submit: { kind: "press_enter" as const },
    message_container: { kind: "role" as const, role: "log" as const, name: null },
    assistant_message: {
      kind: "css" as const,
      value: '[data-message-author-role="assistant"], [data-testid*="assistant" i], .assistant-message',
    },
    completion: { kind: "text_stable" as const, stable_ms: 500 },
    reset: { kind: "new_context" as const },
    assistant_extraction: "last_new_message" as const,
    created_at: new Date().toISOString(),
    extensions: {
      "caudals.evals/discovery": { provider_hint: snapshot.provider_hint },
    },
  };
  return {
    ...common,
    launcher: snapshot.launchers.length
      ? ({ kind: "css", value: '[aria-label*="chat" i], [data-testid*="chat" i]' } as const)
      : null,
  };
}

async function openRecipe(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
}) {
  const context = await args.browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
    ...(args.storageState ? { storageState: scopedBrowserStorageState(args.storageState, args.recipe.start_url) } : {}),
  });
  try {
    await guardBrowserContext(context, args.destinationCheck);
    await restoreBrowserSessionStorage(context, args.storageState);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const activity = trackPageActivity(page);
    await page.goto(args.recipe.start_url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const root = await recipeRoot(page, args.recipe);
    await openChat(page, root, args.recipe);
    return { context, page, root, activity };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Waits for the chat input, clicking the launcher only while the chat is
 * closed: a widget that restores itself open must not be toggled shut.
 */
async function openChat(page: Page, root: FrameLike, recipe: WebsiteRecipe) {
  const deadline = Date.now() + 25_000;
  const loadedAt = Date.now();
  let clicks = 0, lastClick = 0;
  const inputs = partOptions(recipe, "input", recipe.input);
  const launchers = recipe.launcher ? partOptions(recipe, "launcher", recipe.launcher) : [];
  while (Date.now() < deadline) {
    for (const value of inputs) {
      const match = locator(root, recipe, value);
      if ((await match.count().catch(() => 0)) === 1 && (await match.isVisible().catch(() => false))) return;
    }
    if (launchers.length && clicks < 2 && Date.now() - loadedAt > 1_200 && Date.now() - lastClick > 5_000) {
      for (const value of launchers) {
        const match = locator(root, recipe, value).first();
        if (await match.isVisible().catch(() => false)) {
          if (await match.click({ timeout: 5_000 }).then(() => true, () => false)) { clicks++; lastClick = Date.now(); break; }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (await loginRequired(page, recipe.start_url)) throw new Error("login_required");
  throw new Error(recipe.launcher && !clicks ? "launcher_unavailable" : "selector_unavailable");
}

async function invokeOpenWebsite(args: {
  session: Awaited<ReturnType<typeof openRecipe>>;
  recipe: WebsiteRecipe;
  input: CandidateInput;
  context: InvocationContext;
}) {
  assertScorableWebsiteRecipe(args.recipe);
  if (args.context.signal.aborted) throw new Error("target_execution_aborted");
  const started = new Date().toISOString();
  const session = args.session;
  const previous = await textSnapshot(session.root, args.recipe);
  const prompt = [...args.input.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (!prompt) throw new Error("website_prompt_missing");
  const input = await resolvePart(session.root, args.recipe, "input", args.recipe.input, 15_000);
  const submit = args.recipe.submit.kind === "click"
    ? await resolvePart(session.root, args.recipe, "submit", args.recipe.submit.locator, 5_000)
    : null;
  // Requests the submit itself starts are the reply's own streams.
  session.activity.mark();
  await sendWebsitePrompt(session.root, {
    input: args.recipe.input,
    submit: args.recipe.submit.kind === "click" ? args.recipe.submit.locator : null,
    frame_chain: args.recipe.frame_chain,
  }, prompt, { input, submit });
  const output = await waitForCompletion(
    session.root,
    args.recipe,
    previous,
    new Date(args.context.deadline).getTime(),
    session.activity,
  );
  const captured = newAssistantMessages(previous, await textSnapshot(session.root, args.recipe));
  if (!captured.messages.length || !captured.duplicateFree) throw new Error("capture_incomplete");
  const finished = new Date().toISOString();
  if (args.context.signal.aborted) throw new Error("target_execution_aborted");
  return observationSchema.parse(
    withContentHash({
      schema_version: "1.0" as const,
      observation_id: randomUUID(),
      run_id: args.context.run_id,
      case_revision_id: args.input.case_revision_id,
      repetition: 0,
      attempt_id: args.context.attempt_id,
      target_revision_id: args.context.target_revision_id,
      started_at: started,
      finished_at: finished,
      messages: [
        ...args.input.messages,
        { role: "assistant" as const, content: output },
      ],
      tool_events: [],
      artifacts: [],
      provider_request_id: null,
      status: "succeeded" as const,
      error: null,
      metadata: {
        latency_ms: {
          value: Math.max(0, Date.parse(finished) - Date.parse(started)),
          provenance: "measured" as const,
        },
        input_tokens: { value: null, provenance: "unavailable" as const },
        output_tokens: { value: null, provenance: "unavailable" as const },
        cost: { value: null, provenance: "unavailable" as const },
        model_identity: { value: null, provenance: "unavailable" as const },
      },
      extensions: {
        "caudals.evals/browser": {
          recipe_revision_id: args.recipe.recipe_revision_id,
          extraction: args.recipe.assistant_extraction,
          new_message_count: captured.messages.length,
          duplicate_free: captured.duplicateFree,
        },
      },
    }),
  );
}

/** One context belongs to one fenced attempt; subsequent calls keep its widget state. */
export async function openWebsiteAttemptSession(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
}) {
  assertScorableWebsiteRecipe(args.recipe);
  const session = await openRecipe(args);
  let previousMessages: ReturnType<typeof observationSchema.parse>["messages"] | null = null;
  let identity: { runId: string; targetRevisionId: string; attemptId: string } | null = null;
  let busy = false;
  let closed = false;
  return {
    async invoke(input: CandidateInput, context: InvocationContext) {
      if (closed || busy) throw new Error("website_session_unavailable");
      if (identity && (identity.runId !== context.run_id ||
        identity.targetRevisionId !== context.target_revision_id ||
        identity.attemptId !== context.attempt_id)) throw new Error("scenario_identity_mismatch");
      if (previousMessages && (input.messages.length !== previousMessages.length + 1 ||
        canonicalJson(input.messages.slice(0, previousMessages.length)) !== canonicalJson(previousMessages) ||
        input.messages.at(-1)?.role !== "user")) throw new Error("scenario_transcript_mismatch");
      busy = true;
      const abort = () => { void session.context.close().catch(() => {}); };
      context.signal.addEventListener("abort", abort, { once: true });
      try {
        const observation = await invokeOpenWebsite({ session, recipe: args.recipe, input, context });
        identity ??= { runId: context.run_id, targetRevisionId: context.target_revision_id, attemptId: context.attempt_id };
        previousMessages = observation.messages;
        return observation;
      } finally {
        context.signal.removeEventListener("abort", abort);
        busy = false;
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await session.context.close();
    },
  };
}

export async function invokeWebsite(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  input: CandidateInput;
  context: InvocationContext;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
}) {
  const session = await openWebsiteAttemptSession(args);
  try { return await session.invoke(args.input, args.context); }
  finally { await session.close(); }
}

export async function validateWebsiteRecipe(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
  storageState?: BrowserStorageState;
  onResponse?: (response: string) => void;
  signal?: AbortSignal;
}): Promise<BrowserProbeEvidence> {
  const prompts = [
    `Connection check ${randomUUID()}`,
    `Reset check ${randomUUID()}`,
  ];
  const responses: string[] = [];
  const duplicateFlags: boolean[] = [];
  for (const [index, prompt] of prompts.entries()) {
    if (args.signal?.aborted) throw new Error("target_execution_aborted");
    const controller = new AbortController();
    const observation = await invokeWebsite({
      ...args,
      input: {
        schema_version: "1.0",
        case_id: `probe-${index + 1}`,
        case_revision_id: `probe-${index + 1}`,
        messages: [{ role: "user", content: prompt }],
        attachments: [],
        tools: [],
      },
      context: {
        run_id: `probe-${index + 1}`,
        target_revision_id: args.recipe.recipe_revision_id,
        execution_plan_id: `probe-plan-${index + 1}`,
        tenant_scope_handle: "probe",
        deadline: new Date(Date.now() + (args.timeoutMs ?? 30_000)).toISOString(),
        attempt_id: `probe-attempt-${index + 1}`,
        scoped_credential_handle: null,
        destination_policy_id: "public-https-v1",
        reserved_cost: { amount: "0", currency: "EUR" },
        signal: args.signal ?? controller.signal,
      },
    });
    responses.push(
      [...observation.messages]
        .reverse()
        .find((message) => message.role === "assistant")?.content ?? "",
    );
    args.onResponse?.(responses.at(-1)!);
    duplicateFlags.push((observation.extensions["caudals.evals/browser"] as { duplicate_free?: boolean } | undefined)?.duplicate_free === true);
  }
  const multiTurn = await probeWebsiteFollowUp(args);
  return browserProbeEvidenceSchema.parse({
    checked_at: new Date().toISOString(),
    messages: prompts.map((prompt, index) => ({
      prompt_hash: sha256(prompt),
      response_hash: sha256(responses[index]),
    })),
    distinct_responses: responses[0] !== responses[1],
    reset_verified:
      args.recipe.reset.kind !== "unsupported" &&
      !responses[1].includes(prompts[0]),
    streaming_complete: responses.every(Boolean),
    duplicate_free: duplicateFlags.every(Boolean),
    screenshot_artifact_id: null,
    trace_artifact_id: null,
    multi_turn_verified: multiTurn.verified,
    multi_turn_probe: multiTurn.probe,
  });
}

// Sends a follow-up in the same context as a first message. Multi-turn counts as
// verified only when both turns capture a new, complete, non-duplicated reply;
// any failure leaves the capability unverified instead of failing the recipe.
async function probeWebsiteFollowUp(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
  storageState?: BrowserStorageState;
  signal?: AbortSignal;
}) {
  const prompts = [`Conversation check ${randomUUID()}`, `Follow-up check ${randomUUID()}`];
  const controller = new AbortController();
  const context: InvocationContext = {
    run_id: "probe-conversation",
    target_revision_id: args.recipe.recipe_revision_id,
    execution_plan_id: "probe-plan-conversation",
    tenant_scope_handle: "probe",
    deadline: new Date(Date.now() + (args.timeoutMs ?? 30_000)).toISOString(),
    attempt_id: "probe-attempt-conversation",
    scoped_credential_handle: null,
    destination_policy_id: "public-https-v1",
    reserved_cost: { amount: "0", currency: "EUR" },
    signal: args.signal ?? controller.signal,
  };
  const input = (messages: CandidateInput["messages"]): CandidateInput => ({
    schema_version: "1.0", case_id: "probe-conversation", case_revision_id: "probe-conversation", messages, attachments: [], tools: [],
  });
  const reply = (observation: Awaited<ReturnType<typeof invokeOpenWebsite>>) => ({
    text: [...observation.messages].reverse().find((message) => message.role === "assistant")?.content ?? "",
    duplicateFree: (observation.extensions["caudals.evals/browser"] as { duplicate_free?: boolean } | undefined)?.duplicate_free === true,
  });
  let session: Awaited<ReturnType<typeof openWebsiteAttemptSession>> | null = null;
  try {
    session = await openWebsiteAttemptSession(args);
    const first = await session.invoke(input([{ role: "user", content: prompts[0] }]), context);
    const second = await session.invoke(input([...first.messages, { role: "user", content: prompts[1] }]), context);
    const [a, b] = [reply(first), reply(second)];
    const verified = Boolean(a.text && b.text && a.text !== b.text && a.duplicateFree && b.duplicateFree);
    return { verified, probe: verified ? { prompt_hash: sha256(prompts.join("\n")), response_hash: sha256(b.text) } : null };
  } catch {
    return { verified: false, probe: null };
  } finally {
    await session?.close().catch(() => {});
  }
}

export function publicDestinationCheck(lookup?: Lookup): DestinationCheck {
  return async (url) => {
    const parsed = new URL(url);
    if (!/^https:$/.test(parsed.protocol)) throw new Error("destination_invalid");
    await validatePublicDestination(parsed.origin + parsed.pathname, lookup);
  };
}
