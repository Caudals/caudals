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
  browserStorageStateSchema,
  type BrowserDiscoverySnapshot,
  type BrowserLocator,
  type BrowserProbeEvidence,
  type WebsiteRecipe,
  type BrowserStorageState,
} from "../contracts/browser";
import { observationSchema } from "../contracts/results";
import { sha256, withContentHash } from "../contracts/hashing";
import { capabilitySchema } from "../contracts/primitives";
import { validatePublicDestination, type Lookup } from "./egress";

type FrameLike = Page | Frame | FrameLocator;
type DestinationCheck = (url: string) => Promise<void>;

function locator(root: FrameLike, value: BrowserLocator): Locator {
  if (value.kind === "role") {
    return root.getByRole(value.role, value.name ? { name: value.name } : undefined);
  }
  if (value.kind === "label") return root.getByLabel(value.text);
  if (value.kind === "test_id") return root.getByTestId(value.value);
  return root.locator(value.value);
}

async function recipeRoot(page: Page, recipe: WebsiteRecipe): Promise<FrameLike> {
  let root: FrameLike = page;
  for (const step of recipe.frame_chain) {
    const frame = await locator(root, step).first().contentFrame();
    if (!frame) throw new Error("website_frame_unavailable");
    root = frame;
  }
  return root;
}

async function textSnapshot(root: FrameLike, recipe: WebsiteRecipe) {
  return locator(root, recipe.assistant_message)
    .allTextContents()
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
}

export function newAssistantMessages(previous: string[], current: string[]) {
  const samePrefix = previous.every((value, index) => current[index] === value);
  const messages = samePrefix ? current.slice(previous.length) : current;
  return { messages, duplicateFree: new Set(messages).size === messages.length };
}

export async function waitForCompletion(
  root: FrameLike,
  recipe: WebsiteRecipe,
  previous: string[],
  deadline: number,
) {
  let candidate = "";
  let changedAt = 0;
  let prior = "";
  let busySeen = false;
  const stableFor =
    recipe.completion.kind === "text_stable" ? recipe.completion.stable_ms : 500;
  while (Date.now() < deadline) {
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
    let signalReady = true;
    if (recipe.completion.kind === "selector_hidden") {
      const visible = await locator(root, recipe.completion.locator)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) busySeen = true;
      signalReady = busySeen && !visible;
    } else if (recipe.completion.kind === "send_enabled") {
      const enabled = await locator(root, recipe.completion.locator)
        .first()
        .isEnabled()
        .catch(() => false);
      if (!enabled) busySeen = true;
      signalReady = busySeen && enabled;
    }
    if (candidate && signalReady && changedAt && Date.now() - changedAt >= stableFor) {
      return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("capture_incomplete");
}

export function assertScorableWebsiteRecipe(recipe: WebsiteRecipe) {
  if (recipe.completion.kind === "text_stable") {
    throw new Error("website_completion_unverified");
  }
}

export function capabilityReportForWebsite(recipe: WebsiteRecipe) {
  const supported = new Set([
    "text",
    "streaming",
    ...(recipe.reset.kind === "unsupported" ? [] : ["session_reset"]),
  ]);
  return {
    checked_at: new Date().toISOString(),
    features: capabilitySchema.options.map((capability) => ({
      capability,
      status: supported.has(capability)
        ? ("supported" as const)
        : capability === "multi_turn"
          ? ("supported" as const)
          : ("unknown" as const),
      evidence_artifact_id: null,
    })),
  };
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

export async function discoverWebsite(args: {
  browser: Browser;
  url: string;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
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
    const snapshot = await page.evaluate(() => {
      const describe = (element: Element) => {
        const html = element as HTMLElement;
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
      const all = (selector: string, limit = 25) =>
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
    });
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
    ...(args.storageState ? { storageState: browserStorageStateSchema.parse(args.storageState) } : {}),
  });
  try {
    await guardBrowserContext(context, args.destinationCheck);
    const page = await context.newPage();
    await page.goto(args.recipe.start_url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const root = await recipeRoot(page, args.recipe);
    if (args.recipe.launcher) {
      await locator(root, args.recipe.launcher).first().click({ timeout: 10_000 });
    }
    return { context, page, root };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function invokeWebsite(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  input: CandidateInput;
  context: InvocationContext;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
}) {
  assertScorableWebsiteRecipe(args.recipe);
  const started = new Date().toISOString();
  const session = await openRecipe(args);
  try {
    const previous = await textSnapshot(session.root, args.recipe);
    const prompt = [...args.input.messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    if (!prompt) throw new Error("website_prompt_missing");
    const input = locator(session.root, args.recipe.input).first();
    await input.fill(prompt);
    if (args.recipe.submit.kind === "press_enter") await input.press("Enter");
    else await locator(session.root, args.recipe.submit.locator).first().click();
    const output = await waitForCompletion(
      session.root,
      args.recipe,
      previous,
      new Date(args.context.deadline).getTime(),
    );
    const captured = newAssistantMessages(previous, await textSnapshot(session.root, args.recipe));
    if (!captured.messages.length || !captured.duplicateFree) throw new Error("capture_incomplete");
    const finished = new Date().toISOString();
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
  } finally {
    await session.context.close();
  }
}

export async function validateWebsiteRecipe(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
}): Promise<BrowserProbeEvidence> {
  const prompts = [
    `Connection check ${randomUUID()}`,
    `Reset check ${randomUUID()}`,
  ];
  const responses: string[] = [];
  const duplicateFlags: boolean[] = [];
  for (const [index, prompt] of prompts.entries()) {
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
        signal: controller.signal,
      },
    });
    responses.push(
      [...observation.messages]
        .reverse()
        .find((message) => message.role === "assistant")?.content ?? "",
    );
    duplicateFlags.push((observation.extensions["caudals.evals/browser"] as { duplicate_free?: boolean } | undefined)?.duplicate_free === true);
  }
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
  });
}

export function publicDestinationCheck(lookup?: Lookup): DestinationCheck {
  return async (url) => {
    const parsed = new URL(url);
    if (!/^https:$/.test(parsed.protocol)) throw new Error("destination_invalid");
    await validatePublicDestination(parsed.origin + parsed.pathname, lookup);
  };
}
