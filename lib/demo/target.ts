import { request, WebError } from "./web";

/**
 * What the visitor pasted, and how to ask it a question. One field accepts a
 * page with a chat widget, an OpenAI-compatible endpoint, or a curl command
 * for any JSON API; the kind is inferred so the visitor never picks one.
 */
export type TargetSpec =
  | { kind: "website"; url: string }
  | { kind: "openai_compatible"; url: string; model: string }
  | { kind: "https_json"; url: string; template: unknown; slot: Array<string | number>; responsePath: Array<string | number> | null };

/** Header values that may carry credentials; kept in memory only. */
export type TargetSecrets = Record<string, string>;

export class TargetInputError extends Error {}

const OPENAI_PATH = /\/(v\d+\/)?(chat\/)?completions\/?$|\/v\d+\/?$|\/openai\/?$/i;

export function normalizeHttpsUrl(raw: string): URL {
  const trimmed = raw.trim();
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`); } catch { throw new TargetInputError("url_invalid"); }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) throw new TargetInputError("url_invalid");
  url.hash = "";
  return url;
}

/* ----------------------------------------------------------------- curl --- */

/** Splits a shell command into words, honouring quotes and line continuations. */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  const text = command.replace(/\\\r?\n/g, " ");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && /["\\$`]/.test(text[index + 1] ?? "")) current += text[++index];
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; has = true; continue; }
    if (char === "\\") { current += text[++index] ?? ""; has = true; continue; }
    if (/\s/.test(char)) { if (has || current) words.push(current); current = ""; has = false; continue; }
    current += char;
    has = true;
  }
  if (quote) throw new TargetInputError("curl_unterminated_quote");
  if (has || current) words.push(current);
  return words;
}

export type ParsedCurl = { url: URL; headers: Record<string, string>; body: unknown };

export function parseCurl(command: string): ParsedCurl {
  const words = shellWords(command.trim());
  if (words[0] !== "curl") throw new TargetInputError("curl_invalid");
  let url: string | null = null;
  const headers: Record<string, string> = {};
  let data: string | null = null;
  for (let index = 1; index < words.length; index++) {
    const word = words[index];
    const next = () => words[++index] ?? "";
    if (word === "-H" || word === "--header") {
      const header = next();
      const colon = header.indexOf(":");
      if (colon > 0) headers[header.slice(0, colon).trim().toLowerCase()] = header.slice(colon + 1).trim();
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--json"].includes(word)) {
      data = next();
      if (word === "--json") headers["content-type"] ??= "application/json";
    } else if (word === "-X" || word === "--request") {
      if (next().toUpperCase() !== "POST") throw new TargetInputError("curl_method");
    } else if (word === "-u" || word === "--user") {
      headers.authorization = `Basic ${Buffer.from(next()).toString("base64")}`;
    } else if (word === "--url") url = next();
    else if (/^https?:\/\//i.test(word)) url = word;
    else if (["-A", "--user-agent", "-e", "--referer", "-o", "--output", "-m", "--max-time", "--connect-timeout", "-w"].includes(word)) next();
  }
  if (!url) throw new TargetInputError("curl_url");
  if (data === null) throw new TargetInputError("curl_body");
  if (data.startsWith("@")) throw new TargetInputError("curl_body_file");
  let body: unknown;
  try { body = JSON.parse(data); } catch { throw new TargetInputError("curl_body_json"); }
  for (const name of ["content-length", "host", "connection", "transfer-encoding", "te", "upgrade", "expect", "proxy-authorization", "proxy-connection", "accept-encoding"]) delete headers[name];
  return { url: normalizeHttpsUrl(url), headers, body };
}

type Path = Array<string | number>;
const MESSAGE_KEY = /^(message|messages|query|question|input|prompt|text|content|q|msg|pregunta|mensaje|user_input|userMessage|user_message|chatInput|chat_input)$/i;
const PLACEHOLDER = /\{\{\s*(question|message|input|prompt|query|pregunta)\s*\}\}|\$\{?(QUESTION|MESSAGE|INPUT|PROMPT)\}?|<question>|<message>/i;

function* leaves(value: unknown, path: Path = []): Generator<{ path: Path; value: string; key: string | number | undefined }> {
  if (typeof value === "string") { yield { path, value, key: path.at(-1) }; return; }
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) yield* leaves(value[i], [...path, i]); return; }
  if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) yield* leaves(item, [...path, key]);
}

/** Where the question goes in the request body: a placeholder, else the last user message, else a message-like field. */
export function findMessageSlot(body: unknown): Path | null {
  const all = [...leaves(body)];
  const placeholder = all.find((leaf) => PLACEHOLDER.test(leaf.value));
  if (placeholder) return placeholder.path;
  const chat = all.filter((leaf) => leaf.key === "content" && leaf.path.includes("messages"));
  if (chat.length) return chat.at(-1)!.path;
  const named = all.filter((leaf) => typeof leaf.key === "string" && MESSAGE_KEY.test(leaf.key));
  return named.at(-1)?.path ?? null;
}

export function setPath(value: unknown, path: Path, replacement: string): unknown {
  const copy = structuredClone(value) as Record<string | number, unknown>;
  if (!path.length) return replacement;
  let node: Record<string | number, unknown> = copy;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  const key = path.at(-1)!;
  const current = node[key];
  node[key] = typeof current === "string" && PLACEHOLDER.test(current) ? current.replace(PLACEHOLDER, replacement) : replacement;
  return copy;
}

export function getPath(value: unknown, path: Path): unknown {
  let node: unknown = value;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

const ANSWER_KEY = /^(answer|response|reply|output|text|content|message|result|completion|respuesta|generated_text|output_text)$/i;
/** The reply in an unknown JSON response: a well-known path, else the best answer-like string, else the longest string. */
export function findResponsePath(response: unknown, question: string): Path | null {
  const known: Path[] = [["choices", 0, "message", "content"], ["output_text"], ["answer"], ["response"], ["reply"], ["output"], ["text"], ["message", "content"], ["data", "answer"], ["data", "response"], ["result"], ["content", 0, "text"]];
  for (const path of known) {
    const value = getPath(response, path);
    if (typeof value === "string" && value.trim() && value.trim() !== question.trim()) return path;
  }
  const candidates = [...leaves(response)].filter((leaf) => leaf.value.trim().length > 1 && leaf.value.trim() !== question.trim() && !/^(https?:|[0-9a-f-]{20,}$)/i.test(leaf.value));
  candidates.sort((a, b) => Number(typeof b.key === "string" && ANSWER_KEY.test(b.key)) - Number(typeof a.key === "string" && ANSWER_KEY.test(a.key)) || b.value.length - a.value.length);
  return candidates[0]?.path ?? null;
}

/* --------------------------------------------------------- classification --- */

export type ClassifiedTarget = { spec: TargetSpec; secrets: TargetSecrets; site: URL | null };

/**
 * Turns the visitor's input into a target. `apiKey` and `model` only apply to
 * an OpenAI-compatible endpoint; a curl command carries its own headers.
 */
export function classifyTarget(input: string, extras: { apiKey?: string; model?: string } = {}): ClassifiedTarget {
  const text = input.trim();
  if (/^curl\s/i.test(text)) {
    const curl = parseCurl(text);
    const slot = findMessageSlot(curl.body);
    if (!slot) throw new TargetInputError("curl_no_message_field");
    const secrets: TargetSecrets = {};
    for (const [name, value] of Object.entries(curl.headers)) if (name !== "content-type") secrets[name] = value;
    return { spec: { kind: "https_json", url: curl.url.href, template: curl.body, slot, responsePath: null }, secrets, site: null };
  }
  const url = normalizeHttpsUrl(text);
  if (OPENAI_PATH.test(url.pathname) || extras.model?.trim()) {
    if (!extras.model?.trim()) throw new TargetInputError("model_required");
    const path = url.pathname.replace(/\/+$/, "");
    if (!/completions$/i.test(path)) url.pathname = `${path}/chat/completions`;
    url.search = "";
    const secrets: TargetSecrets = extras.apiKey?.trim() ? { authorization: `Bearer ${extras.apiKey.trim()}` } : {};
    return { spec: { kind: "openai_compatible", url: url.href, model: extras.model.trim().slice(0, 200) }, secrets, site: null };
  }
  return { spec: { kind: "website", url: url.href }, secrets: {}, site: url };
}

/** Whether the input looks like an API rather than a page, for the form's live hint. */
export function looksLikeApi(input: string) {
  const text = input.trim();
  if (/^curl\s/i.test(text)) return "curl" as const;
  try { return OPENAI_PATH.test(normalizeHttpsUrl(text).pathname) ? "openai" as const : "website" as const; } catch { return null; }
}

/* ----------------------------------------------------------------- calls --- */

export type TargetAnswer = { text: string; ms: number; error: string | null };

function errorCode(error: unknown) {
  if (error instanceof WebError) return error.message;
  if (error instanceof TargetInputError) return error.message;
  return "target_unreachable";
}

/** Asks an API target one question in a fresh conversation. */
export async function askApi(spec: Exclude<TargetSpec, { kind: "website" }>, secrets: TargetSecrets, question: string, signal?: AbortSignal): Promise<TargetAnswer & { responsePath?: Path | null }> {
  const started = Date.now();
  try {
    const body = spec.kind === "openai_compatible"
      ? { model: spec.model, messages: [{ role: "user", content: question }], max_tokens: 1_500, stream: false }
      : setPath(spec.template, spec.slot, question);
    const response = await request(spec.url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { accept: "application/json", ...secrets },
      timeoutMs: 60_000,
      maxBytes: 1_000_000,
      signal,
    });
    if (response.status === 401 || response.status === 403) return { text: "", ms: Date.now() - started, error: "target_auth" };
    if (response.status === 404) return { text: "", ms: Date.now() - started, error: "target_not_found" };
    if (response.status === 429) return { text: "", ms: Date.now() - started, error: "target_rate_limited" };
    if (response.status < 200 || response.status >= 300) return { text: "", ms: Date.now() - started, error: `target_http_${response.status}` };
    let parsed: unknown;
    try { parsed = JSON.parse(response.body.toString("utf8")); } catch { return { text: "", ms: Date.now() - started, error: "target_not_json" }; }
    if (spec.kind === "openai_compatible") {
      // A message with null content (a reasoning model that ran out of tokens) is an empty answer, not an unreadable one.
      const message = getPath(parsed, ["choices", 0, "message"]);
      const content = getPath(parsed, ["choices", 0, "message", "content"]);
      return { text: typeof content === "string" ? content.trim() : "", ms: Date.now() - started, error: message && typeof message === "object" ? null : "target_shape" };
    }
    const path = spec.responsePath ?? findResponsePath(parsed, question);
    const value = path ? getPath(parsed, path) : undefined;
    return { text: typeof value === "string" ? value.trim() : "", ms: Date.now() - started, error: typeof value === "string" ? null : "target_shape", responsePath: path };
  } catch (error) {
    return { text: "", ms: Date.now() - started, error: errorCode(error) };
  }
}
