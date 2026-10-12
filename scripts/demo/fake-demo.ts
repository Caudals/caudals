/**
 * Deterministic fakes for the public demo engine (tests/evals/demo-queue-db.test.ts
 * and scripts/demo/load-test.ts): a site reader, an assistant, and an
 * OpenAI-compatible model provider whose primary and fallback routes can be
 * made to rate-limit, refuse spending or fail. No network, no spend.
 */
import type { DemoPage } from "../../lib/demo/web";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TOPICS = [
  ["Plans", "The Basic plan costs 12 euros per month and includes up to 3 users with email support on working days."],
  ["Plans", "The Business plan costs 49 euros per month, includes 25 users and adds phone support from 8:00 to 20:00."],
  ["Refunds", "Annual subscriptions can be refunded in full within 30 days of purchase when fewer than 100 requests were made."],
  ["Refunds", "Monthly subscriptions are not refunded, but they can be cancelled at any time before the next renewal date."],
  ["Security", "Customer data is stored in Frankfurt and encrypted at rest with AES-256; backups are kept for 35 days."],
  ["Security", "Single sign-on with SAML is available on the Business plan and above, configured from the admin console."],
  ["Limits", "Each workspace can upload files of up to 250 MB, and the API allows 600 requests per minute per key."],
  ["Limits", "Free trials last 14 days and convert to the Basic plan only when the customer adds a payment method."],
];

/** Three pages with enough grounded facts for eight questions. */
export function fakePages(site: string): DemoPage[] {
  return [0, 1, 2].map((page) => ({
    url: `https://${site}/help/${page + 1}`,
    title: `Help ${page + 1}`,
    text: [
      ...TOPICS.slice(page * 3, page * 3 + 3).map(([heading, line]) => `## ${heading}\n${line} Ask the support team if your case is different.`),
      "## Contact\nThe support team answers questions about this page within two working days, in English or Spanish, by email or chat.",
    ].join("\n"),
  }));
}

export function fakeReadSite(latencyMs = 50) {
  return async (url: string, options: { onPage?: (page: DemoPage) => void } = {}) => {
    await sleep(latencyMs);
    const pages = fakePages(new URL(url).hostname);
    for (const page of pages) options.onPage?.(page);
    return { pages, lang: "en", finalUrl: url };
  };
}

export function fakeAskApi(latencyMs = 20) {
  return async (_spec: unknown, _secrets: unknown, question: string) => {
    await sleep(latencyMs);
    return { text: `Thanks for asking. ${question.replace(/\?$/, "")}: please see our help pages.`, ms: latencyMs, error: null };
  };
}

/** What a sensible model would answer to the demo's two prompts. */
export function fakeModelContent(messages: Array<{ role: string; content: string }>): string {
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  if (user.includes("Excerpts:")) {
    const excerpts = [...user.matchAll(/\[(\d+\.\d+)\]\n([^\n]+(?:\n(?!\[)[^\n]+)*)/g)];
    const tests = excerpts.flatMap(([, id, text]) => text.split("\n").filter((line) => !line.startsWith("## ") && line.length > 40).map((line) => {
      const sentence = line.split(/(?<=\.)\s/)[0];
      return { question: `What does the help centre say in part ${id} about "${sentence.split(" ").slice(1, 4).join(" ")}"?`, expected: sentence, facts: [], quote: sentence, excerpt: id, severity: "medium" };
    }));
    return JSON.stringify({ tests: tests.slice(0, 8) });
  }
  const ids = [...user.matchAll(/^### (q\d+)$/gm)].map((match) => match[1]);
  return JSON.stringify({ results: ids.map((id, index) => ({ id, verdict: index % 3 === 0 ? "partial" : "correct", cause: index % 3 === 0 ? "missing_information" : null, facts: [], note: "Fixture verdict." })) });
}

export type RouteBehaviour = {
  /** Status to answer with instead of a reply: 429 (rate limit), 403/402 (spending limit), 503. */
  fail?: (call: number) => number | null;
  latencyMs?: number;
  /** USD cost reported in `usage.cost` (fallback only). */
  costUsd?: number;
};

export type FakeProviderStats = { primary: number; fallback: number; primaryFailed: number; fallbackFailed: number };

/**
 * A fetch that answers the primary and fallback endpoints and passes every
 * other URL to `next` (or refuses it, so a test cannot reach the network).
 */
export function fakeModelFetch(options: { primary: string; fallback: string; primaryBehaviour?: RouteBehaviour; fallbackBehaviour?: RouteBehaviour; next?: typeof fetch }) {
  const stats: FakeProviderStats = { primary: 0, fallback: 0, primaryFailed: 0, fallbackFailed: 0 };
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = url.startsWith(options.primary) ? "primary" : url.startsWith(options.fallback) ? "fallback" : null;
    if (!route) {
      if (options.next) return options.next(input, init);
      throw new Error(`fake_fetch_refused ${new URL(url).host}`);
    }
    const behaviour = (route === "primary" ? options.primaryBehaviour : options.fallbackBehaviour) ?? {};
    const call = ++stats[route];
    if (behaviour.latencyMs) await sleep(behaviour.latencyMs);
    const status = behaviour.fail?.(call) ?? null;
    if (status) {
      stats[route === "primary" ? "primaryFailed" : "fallbackFailed"]++;
      return Response.json({ error: { message: "fake failure", code: status } }, { status });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string; messages?: Array<{ role: string; content: string }>; stream?: boolean };
    const content = fakeModelContent(body.messages ?? []);
    const model = body.model ?? "fake-model";
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages ?? []).length / 4), completion_tokens: Math.ceil(content.length / 4), ...(route === "fallback" && behaviour.costUsd !== undefined ? { cost: behaviour.costUsd } : {}) };
    if (!body.stream) return Response.json({ model, choices: [{ message: { role: "assistant", content } }], usage });
    const encoder = new TextEncoder();
    const chunks = content.match(/[\s\S]{1,80}/g) ?? [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model, choices: [{ delta: { content: chunk } }] })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model, choices: [{ delta: {} }], usage })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  return { fetch: fetcher as typeof fetch, stats };
}
