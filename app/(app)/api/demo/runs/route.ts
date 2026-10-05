import { z } from "zod";
import { clientHash } from "@/lib/demo/client";
import { failure, json, newToken, sameOrigin, setCookie } from "@/lib/demo/http";
import { admit, LimitError } from "@/lib/demo/limits";
import { verifyChallenge } from "@/lib/demo/pow";
import { demoEnabled, ensureDemoRunner, rememberSecrets } from "@/lib/demo/runner";
import { insertRun, spendChallenge } from "@/lib/demo/store";
import { classifyTarget, normalizeHttpsUrl, TargetInputError } from "@/lib/demo/target";
import { pinPublic, WebError } from "@/lib/demo/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.strictObject({
  target: z.string().trim().min(4).max(8_000),
  docs: z.string().trim().max(2_048).optional(),
  apiKey: z.string().trim().max(1_000).optional(),
  model: z.string().trim().max(200).optional(),
  locale: z.enum(["en", "es"]),
  challenge: z.strictObject({ salt: z.string().max(64), bits: z.number().int(), expires: z.number().int(), signature: z.string().max(128) }),
  nonce: z.string().max(16),
});

/** Starts one demo: checks the challenge, the input and the limits, then queues the run. */
export async function POST(request: Request) {
  if (!demoEnabled()) return failure("closed", 503);
  if (!sameOrigin(request)) return failure("forbidden", 403);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_000) return failure("input_invalid", 413);
  let body: z.infer<typeof input>;
  try { body = input.parse(await request.json()); } catch { return failure("input_invalid", 400); }

  const client = clientHash(request.headers);
  const spent = verifyChallenge(body.challenge, body.nonce, client);
  if (!spent || !(await spendChallenge(spent))) return failure("challenge_invalid", 400);

  let classified: ReturnType<typeof classifyTarget>;
  let docsUrl: URL;
  try {
    classified = classifyTarget(body.target, { apiKey: body.apiKey, model: body.model });
    if (body.docs) docsUrl = normalizeHttpsUrl(body.docs);
    else if (classified.site) docsUrl = classified.site;
    else return failure("docs_required", 400);
    await Promise.all([pinPublic(classified.spec.url), pinPublic(docsUrl.href)]);
  } catch (error) {
    if (error instanceof TargetInputError || error instanceof WebError) return failure(error.message, 400);
    throw error;
  }

  // Website chats need the browser worker's demo loop (EVALS_BROWSER_DEMO_ENABLED).
  if (classified.spec.kind === "website" && process.env.DEMO_BROWSER_ENABLED !== "true") return failure("website_unavailable", 503);
  const targetHost = new URL(classified.spec.url).hostname;
  try {
    await admit(client, targetHost, docsUrl.hostname);
  } catch (error) {
    if (error instanceof LimitError) return failure(error.message, error.message === "capacity" || error.message === "busy" ? 503 : 429);
    throw error;
  }

  const { token, hash } = newToken();
  const id = await insertRun({
    tokenHash: hash, locale: body.locale, spec: classified.spec, targetHost,
    docsUrl: docsUrl.href, docsHost: docsUrl.hostname, clientHash: client,
    auth: Object.keys(classified.secrets).length > 0,
  });
  rememberSecrets(id, classified.secrets);
  ensureDemoRunner();
  return json({ id, token }, { status: 201, headers: { "Set-Cookie": setCookie(id, token) } });
}
