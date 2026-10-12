import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import { fallbackEnabled, fallbackForced } from "./config";
import { costOf, fallbackConfig, holdFor, reserveFallback, settleFallback } from "./fallback";
import { isAvailabilityCode, isDown, markDown, markUp, type Route } from "./health";
import { demoEndpoint, demoModels, safeDemoSecret as safeSecret } from "./model-settings";
export { DEFAULT_DGX_ENDPOINT, DEFAULT_DEMO_MODELS, demoEndpoint, demoModels } from "./model-settings";

/**
 * The demo's models. The primary is DeepSeek on the private DGX Spark (Ollama's
 * OpenAI-compatible /v1 endpoint), or an override through environment
 * variables. With DEMO_FALLBACK_ENABLED, a primary that is down, rate-limited
 * or out of its daily calls hands over to one commercial model under the daily
 * euro cap (lib/demo/fallback.ts). When neither can serve, chat() throws
 * CapacityError and the run waits in the queue instead of failing.
 */
/** Model calls the demo may make on the primary per UTC day; defaults to 200 on DGX Spark. */
export function dailyCallLimit(): number {
  const value = Number(process.env.DEMO_DAILY_MODEL_CALLS ?? 200);
  return Number.isInteger(value) && value > 0 ? value : 200;
}

export class QuotaError extends Error { constructor() { super("demo_quota_exhausted"); } }
export class ModelError extends Error {}
/** No model can serve now: the primary is unavailable and the fallback is off, unfunded, capped or down. */
export class CapacityError extends Error {
  constructor(readonly code: string) { super("capacity"); }
}

export async function callsToday() {
  const { rows } = await getPostgresPool().query<{ calls: number }>("SELECT calls FROM demo.llm_usage WHERE day = (now() AT TIME ZONE 'utc')::date");
  return rows[0]?.calls ?? 0;
}

/** Reserves one call on today's budget, or throws QuotaError. */
async function reserveCall() {
  const { rows } = await getPostgresPool().query<{ calls: number }>(
    `INSERT INTO demo.llm_usage (day, calls) VALUES ((now() AT TIME ZONE 'utc')::date, 1)
     ON CONFLICT (day) DO UPDATE SET calls = demo.llm_usage.calls + 1, updated_at = now()
     WHERE demo.llm_usage.calls < $1
     RETURNING calls`,
    [dailyCallLimit()],
  );
  if (!rows[0]) throw new QuotaError();
}

let keyStatus: { at: number; remaining: number | null } | null = null;
/** The provider's own count of free requests left today when using OpenRouter. Null on DGX Spark. */
export async function providerRemaining(): Promise<number | null> {
  const endpoint = demoEndpoint();
  if (!endpoint.includes("openrouter.ai")) return null;
  if (keyStatus && Date.now() - keyStatus.at < 60_000) return keyStatus.remaining;
  const key = safeSecret("DEMO_OPENROUTER_API_KEY");
  if (!key) return 0;
  let remaining: number | null = null;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000) });
    if (response.ok) {
      const body = await response.json() as { data?: { free_model_daily_requests?: { remaining?: unknown } } };
      const value = body.data?.free_model_daily_requests?.remaining;
      remaining = typeof value === "number" ? value : null;
    }
  } catch { /* unknown: rely on the local count */ }
  keyStatus = { at: Date.now(), remaining };
  return remaining;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatResult = { text: string; model: string; route: Route; costEur: number };
/** One settled model call: which route and model answered, and what it cost. */
export type ChatUsage = { route: Route; model: string; costEur: number; ok: boolean };

type ChatArgs = {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  json?: boolean;
  onText?: (text: string) => void;
  /** Rejects a reply that is not usable (for example, unparseable JSON), so the next model is tried. */
  accept?: (text: string) => boolean;
  signal?: AbortSignal;
  /** Called (and awaited) after every call that answered or was charged. */
  onUsage?: (usage: ChatUsage) => void | Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One chat completion. With `onText`, the reply streams and `onText` receives
 * the text so far after every chunk.
 */
export async function chat(args: ChatArgs): Promise<ChatResult> {
  // Without the fallback the primary behaves exactly as before L-03.
  if (!fallbackEnabled()) return chatPrimary(args, false);
  if (!fallbackForced() && !isDown("primary")) {
    try {
      return await chatPrimary(args, true);
    } catch (error) {
      if (args.signal?.aborted) throw error;
      console.warn("demo_primary_failed_over", { code: error instanceof Error ? error.message : "unknown" });
    }
  }
  if (isDown("fallback")) throw new CapacityError("fallback_unavailable");
  try {
    return await chatFallback(args);
  } catch (error) {
    if (args.signal?.aborted || error instanceof CapacityError) throw error;
    if (error instanceof ModelError && isAvailabilityCode(error.message)) throw new CapacityError(error.message);
    throw error;
  }
}

function codeOf(error: unknown, timedOut: boolean) {
  return error instanceof ModelError ? error.message : timedOut ? "model_timeout" : "model_unreachable";
}

/**
 * The primary route. `failFast` (fallback on) gives up after the first
 * availability failure and two content failures, so the fallback answers
 * while the visitor is still watching.
 */
async function chatPrimary(args: ChatArgs, failFast: boolean): Promise<ChatResult> {
  const endpoint = demoEndpoint();
  const isOpenRouter = endpoint.includes("openrouter.ai");
  const key = safeSecret("DEMO_API_KEY") ?? safeSecret("DEMO_OPENROUTER_API_KEY");
  if (isOpenRouter && !key) throw new ModelError("demo_model_unconfigured");

  const models = await demoModels();
  let lastError: Error = new ModelError("model_failed");
  const waits = failFast ? [0, 3_000] : [0, 4_000, 10_000];
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await sleep(waits[attempt]);
    if (args.signal?.aborted) throw new ModelError("aborted");
    try {
      await reserveCall();
    } catch (error) {
      if (error instanceof QuotaError) markDown("primary", error.message);
      throw error;
    }
    const shift = attempt % models.length;
    const ordered = [...models.slice(shift), ...models.slice(0, shift)];
    const model = ordered[0];
    const timeout = AbortSignal.timeout(args.timeoutMs ?? 120_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (key && (isOpenRouter || !endpoint.includes("192.168."))) headers.authorization = `Bearer ${key}`;
    if (isOpenRouter) {
      headers["http-referer"] = "https://caudals.com/demo";
      headers["x-title"] = "Caudals demo";
    }

    const body: Record<string, unknown> = {
      model,
      messages: args.messages,
      max_tokens: args.maxTokens,
      temperature: args.temperature ?? 0.2,
      stream: Boolean(args.onText),
      ...(args.json ? { response_format: { type: "json_object" } } : {}),
    };

    if (isOpenRouter) {
      body.models = ordered.slice(0, 3);
      body.reasoning = { effort: "low", exclude: true };
    } else {
      // Ollama / DGX Spark: DeepSeek V4 Flash requires reasoning_effort: "none"
      // to output content directly instead of spending all tokens reasoning.
      body.reasoning_effort = "none";
    }

    try {
      const response = await fetch(endpoint, { method: "POST", signal, headers, body: JSON.stringify(body) });
      if (!response.ok) {
        lastError = new ModelError(response.status === 429 ? "model_rate_limited" : `model_http_${response.status}`);
        await response.body?.cancel().catch(() => {});
      } else {
        const result = args.onText ? await readStream(response, args.onText) : await readJson(response);
        if (!result.text.trim()) lastError = new ModelError("model_empty");
        else if (args.accept && !args.accept(result.text)) lastError = new ModelError("model_unusable");
        else {
          markUp("primary");
          await args.onUsage?.({ route: "primary", model: result.model, costEur: 0, ok: true });
          return { text: result.text, model: result.model, route: "primary", costEur: 0 };
        }
      }
    } catch (error) {
      if (args.signal?.aborted) throw error;
      lastError = new ModelError(codeOf(error, timeout.aborted));
    }
    console.warn("demo_model_attempt_failed", { attempt, code: lastError.message, model });
    if (isAvailabilityCode(lastError.message)) {
      markDown("primary", lastError.message);
      if (failFast) break;
    }
  }
  throw lastError;
}

/** The commercial fallback: one model, every call held against the daily euro cap first. */
async function chatFallback(args: ChatArgs): Promise<ChatResult> {
  const config = fallbackConfig();
  if (!config.key || config.dailyCapEur <= 0) {
    markDown("fallback", "fallback_unconfigured");
    throw new CapacityError("fallback_unconfigured");
  }
  const inputBytes = Buffer.byteLength(JSON.stringify(args.messages), "utf8");
  let lastError: Error = new ModelError("model_failed");
  for (const wait of [0, 3_000]) {
    if (wait) await sleep(wait);
    if (args.signal?.aborted) throw new ModelError("aborted");
    const hold = holdFor(inputBytes, args.maxTokens, config);
    const reservation = await reserveFallback(hold, config.dailyCapEur);
    if (!reservation) {
      markDown("fallback", "fallback_cap");
      throw new CapacityError("fallback_cap");
    }
    const timeout = AbortSignal.timeout(args.timeoutMs ?? 120_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
    // A transport failure can happen after inference starts but before headers
    // arrive. Only a definite rejection releases the reservation for free.
    let mayBeCharged = true;
    let usage: Usage = null;
    let answered: { text: string; model: string } | null = null;
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.key}`,
          "http-referer": "https://caudals.com/demo",
          "x-title": "Caudals demo",
        },
        body: JSON.stringify({
          model: config.model,
          messages: args.messages,
          max_tokens: args.maxTokens,
          temperature: args.temperature ?? 0.2,
          stream: Boolean(args.onText),
          usage: { include: true },
          provider: {
            require_parameters: true,
            max_price: {
              prompt: config.inputEurPerMTok / config.usdToEur,
              completion: config.outputEurPerMTok / config.usdToEur,
              request: 0,
            },
          },
          reasoning: { effort: "low", exclude: true },
          ...(args.onText ? { stream_options: { include_usage: true } } : {}),
          ...(args.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!response.ok) {
        mayBeCharged = ![400, 401, 402, 403, 404, 422, 429].includes(response.status);
        lastError = new ModelError(response.status === 429 ? "model_rate_limited" : `model_http_${response.status}`);
        await response.body?.cancel().catch(() => {});
      } else {
        const result = args.onText
          ? await readStream(response, args.onText, (value) => { usage = value; })
          : await readJson(response, (value) => { usage = value; });
        if (!result.text.trim()) lastError = new ModelError("model_empty");
        else if (args.accept && !args.accept(result.text)) lastError = new ModelError("model_unusable");
        else answered = { text: result.text, model: result.model === "unknown" ? config.model : result.model };
      }
    } catch (error) {
      lastError = !(error instanceof ModelError) && args.signal?.aborted ? new ModelError("aborted") : new ModelError(codeOf(error, timeout.aborted));
    }
    const cost = mayBeCharged ? costOf(usage, hold, config) : 0;
    try {
      await settleFallback(reservation, cost);
    } catch (error) {
      // The hold stays counted: the cap errs on the side of spending less.
      console.error("demo_fallback_settle_failed", { error_type: error instanceof Error ? error.name : typeof error });
    }
    if (mayBeCharged) await args.onUsage?.({ route: "fallback", model: answered?.model ?? config.model, costEur: cost, ok: Boolean(answered) });
    if (answered) {
      markUp("fallback");
      return { text: answered.text, model: answered.model, route: "fallback", costEur: cost };
    }
    if (args.signal?.aborted) throw lastError;
    console.warn("demo_fallback_attempt_failed", { code: lastError.message, model: config.model });
    if (isAvailabilityCode(lastError.message)) {
      markDown("fallback", lastError.message);
      break;
    }
  }
  throw lastError;
}

type Usage = { cost?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown } | null;

async function readJson(response: Response, onUsage?: (usage: Usage) => void): Promise<{ text: string; model: string }> {
  const body = await response.json() as { model?: string; choices?: Array<{ message?: { content?: unknown } }>; error?: unknown; usage?: Usage };
  if (body.usage && typeof body.usage === "object") onUsage?.(body.usage);
  // Gateways sometimes report a provider failure inside an HTTP 200.
  if (body.error) throw new ModelError("model_error");
  const content = body.choices?.[0]?.message?.content;
  return { text: typeof content === "string" ? content : "", model: body.model ?? "unknown" };
}

async function readStream(response: Response, onText: (text: string) => void, onUsage?: (usage: Usage) => void): Promise<{ text: string; model: string }> {
  if (!response.body) throw new ModelError("model_empty");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = "unknown";
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return { text, model };
      try {
        const event = JSON.parse(data) as { model?: string; error?: unknown; usage?: Usage; choices?: Array<{ delta?: { content?: unknown } }> };
        if (event.error) throw new ModelError("model_error");
        if (event.model) model = event.model;
        if (event.usage && typeof event.usage === "object") onUsage?.(event.usage);
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) { text += delta; onText(text); }
      } catch (error) {
        if (error instanceof ModelError) throw error;
      }
    }
  }
  return { text, model };
}
