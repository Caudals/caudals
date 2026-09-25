import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  model: z.literal("caudals-synthetic-chatbot"),
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(2000) }).passthrough()).min(1).max(8),
  max_tokens: z.number().int().positive().max(500),
  stream: z.literal(false).optional(),
}).passthrough();

function authorized(value: string | null) {
  const path = process.env.EVALS_SYNTHETIC_TARGET_TOKEN_FILE;
  if (!path || !value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  let expected: Buffer;
  try { expected = Buffer.from(readFileSync(path, "utf8").trim()); }
  catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function boundedBody(request: Request) {
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error("body_too_large"); }
    chunks.push(value);
  }
  return requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

/**
 * Multi-turn policy A fixture: when the latest user turn asks for the total
 * with the 10% fee, use the most recent subtotal stated anywhere in the user
 * history. A correct answer therefore proves the whole conversation was sent.
 */
function conversationTotal(messages: Array<{ role: string; content: string }>): string | null {
  const users = messages.filter((message) => message.role === "user").map((message) => message.content);
  if (!/10% fee/i.test(users.at(-1) ?? "")) return null;
  const amounts = users.flatMap((content) => [...content.matchAll(/subtotal(?: is|:)?\s*EUR\s*(\d+(?:\.\d{1,2})?)/gi)].map((match) => match[1]));
  const latest = amounts.at(-1);
  if (!latest) return null;
  const cents = Math.round(Number(latest) * 100);
  return `EUR ${(Math.round(cents * 1.1) / 100).toFixed(2)}`;
}

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (!authorized(request.headers.get("authorization")))
    return Response.json({ error: "not_found" }, { status: 404, headers });
  try {
    const input = await boundedBody(request);
    const prompt = [...input.messages].reverse().find(message => message.role === "user")?.content ?? "";
    const answer = /subtotal of EUR 123\.45/i.test(prompt)
      ? "EUR 135.80"
      : conversationTotal(input.messages) ?? "This synthetic chatbot answers only the policy A fixture.";
    return Response.json({
      id: "caudals-synthetic-fixture",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: input.model,
      choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 },
    }, { headers });
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
}
