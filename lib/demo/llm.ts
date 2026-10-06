import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import { demoEndpoint, demoModels, safeDemoSecret as safeSecret } from "./model-settings";
export { DEFAULT_DGX_ENDPOINT, DEFAULT_DEMO_MODELS, demoEndpoint, demoModels } from "./model-settings";

/**
 * The demo's primary model provider: DeepSeek on the private DGX Spark (via Ollama
 * OpenAI-compatible /v1 endpoint), with optional fallback or override through
 * environment variables.
 */
/** Model calls the demo may make per UTC day; defaults to 200 on DGX Spark. */
export function dailyCallLimit(): number {
  const value = Number(process.env.DEMO_DAILY_MODEL_CALLS ?? 200);
  return Number.isInteger(value) && value > 0 ? value : 200;
}

export class QuotaError extends Error { constructor() { super("demo_quota_exhausted"); } }
export class ModelError extends Error {}

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
export type ChatResult = { text: string; model: string };

/**
 * One chat completion. With `onText`, the reply streams and `onText` receives
 * the text so far after every chunk.
 */
export async function chat(args: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  json?: boolean;
  onText?: (text: string) => void;
  /** Rejects a reply that is not usable (for example, unparseable JSON), so the next model is tried. */
  accept?: (text: string) => boolean;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const endpoint = demoEndpoint();
  const isOpenRouter = endpoint.includes("openrouter.ai");
  const key = safeSecret("DEMO_API_KEY") ?? safeSecret("DEMO_OPENROUTER_API_KEY");
  if (isOpenRouter && !key) throw new ModelError("demo_model_unconfigured");

  const models = await demoModels();
  let lastError: Error = new ModelError("model_failed");
  const waits = [0, 4_000, 10_000];
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    if (args.signal?.aborted) throw new ModelError("aborted");
    await reserveCall();
    const shift = attempt % models.length;
    const ordered = [...models.slice(shift), ...models.slice(0, shift)];
    const model = ordered[0];
    const timeout = AbortSignal.timeout(args.timeoutMs ?? 120_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (key && (isOpenRouter || !endpoint.includes("192.168."))) {
      headers.authorization = `Bearer ${key}`;
    }
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
      const response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        lastError = new ModelError(response.status === 429 ? "model_rate_limited" : `model_http_${response.status}`);
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const result = args.onText ? await readStream(response, args.onText) : await readJson(response);
      if (!result.text.trim()) { lastError = new ModelError("model_empty"); continue; }
      if (args.accept && !args.accept(result.text)) { lastError = new ModelError("model_unusable"); continue; }
      return result;
    } catch (error) {
      if (args.signal?.aborted) throw error;
      lastError = error instanceof ModelError ? error : new ModelError(timeout.aborted ? "model_timeout" : "model_unreachable");
    }
    console.warn("demo_model_attempt_failed", { attempt, code: lastError.message, model });
  }
  throw lastError;
}

async function readJson(response: Response): Promise<ChatResult> {
  const body = await response.json() as { model?: string; choices?: Array<{ message?: { content?: unknown } }>; error?: unknown };
  // Gateways sometimes report a provider failure inside an HTTP 200.
  if (body.error) throw new ModelError("model_error");
  const content = body.choices?.[0]?.message?.content;
  return { text: typeof content === "string" ? content : "", model: body.model ?? "unknown" };
}

async function readStream(response: Response, onText: (text: string) => void): Promise<ChatResult> {
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
        const event = JSON.parse(data) as { model?: string; error?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
        if (event.error) throw new ModelError("model_error");
        if (event.model) model = event.model;
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) { text += delta; onText(text); }
      } catch (error) {
        if (error instanceof ModelError) throw error;
      }
    }
  }
  return { text, model };
}
