import { createPrivateKey, createPublicKey, randomBytes, sign, timingSafeEqual, verify } from "node:crypto";
import { z } from "zod";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { candidateInputSchema } from "../contracts/projections";
import { executionStatusSchema, sanitizedErrorSchema, toolEventSchema } from "../contracts/results";
import { messageSchema, moneySchema } from "../contracts/primitives";

export const runnerBundleSchema = z.strictObject({
  schema_version: z.literal("1.0"), job_id: z.uuid(), org_id: z.uuid(), project_id: z.uuid(),
  run_id: z.uuid(), suite_version_id: z.uuid(), target_id: z.uuid(), target_revision_id: z.uuid(),
  nonce: z.string().regex(/^[a-f0-9]{64}$/), issued_at: z.iso.datetime(), expires_at: z.iso.datetime(),
  cases: z.array(z.strictObject({ case_unit_id: z.uuid(), repetition: z.int().nonnegative(), input: candidateInputSchema })).min(1).max(1000),
});
export const signedRunnerBundleSchema = z.strictObject({ payload: runnerBundleSchema, signature: z.base64(), public_key: z.string().min(1) });
const reported = <T extends z.ZodType>(value: T) => z.discriminatedUnion("provenance", [
  z.strictObject({ value, provenance: z.literal("customer_reported") }),
  z.strictObject({ value: z.null(), provenance: z.literal("unavailable") }),
]);
export const runnerResultSchema = z.strictObject({
  started_at: z.iso.datetime(), finished_at: z.iso.datetime(),
  messages: z.array(messageSchema).max(200), tool_events: z.array(toolEventSchema).max(200),
  status: executionStatusSchema, error: sanitizedErrorSchema.nullable(),
  provider_request_id: z.string().max(200).nullable(),
  metadata: z.strictObject({
    latency_ms: reported(z.int().nonnegative()), input_tokens: reported(z.int().nonnegative()),
    output_tokens: reported(z.int().nonnegative()), cost: reported(moneySchema),
    model_identity: reported(z.string().min(1).max(200)),
  }),
}).superRefine((value, ctx) => {
  if (Date.parse(value.finished_at) < Date.parse(value.started_at)) ctx.addIssue({ code: "custom", message: "Invalid runner timing" });
  if ((value.status === "succeeded") !== (value.error === null)) ctx.addIssue({ code: "custom", message: "Status and error disagree" });
  if (value.error && value.error.category !== value.status) ctx.addIssue({ code: "custom", message: "Error category disagrees with status" });
});
export const runnerUploadSchema = z.strictObject({
  job_id: z.uuid(), case_unit_id: z.uuid(), result: runnerResultSchema,
  signature: z.base64(),
});
export type RunnerBundle = z.infer<typeof runnerBundleSchema>;
export type RunnerUpload = z.infer<typeof runnerUploadSchema>;

export function newRunnerToken() { return randomBytes(32).toString("base64url"); }
export function runnerCompletionStatus(total:number,succeeded:number){
  if(!Number.isInteger(total)||!Number.isInteger(succeeded)||total<1||succeeded<0||succeeded>total)throw new Error("runner_counts_invalid");
  return succeeded===total?"completed" as const:succeeded>0?"partial" as const:"failed" as const;
}
export function tokenHash(token: string) { return sha256(token); }
export function tokenMatches(token: string, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash) || token.length > 256) return false;
  return timingSafeEqual(Buffer.from(tokenHash(token), "hex"), Buffer.from(hash, "hex"));
}
export function signPayload(payload: unknown, privatePem: string) {
  return sign(null, Buffer.from(canonicalJson(payload)), createPrivateKey(privatePem)).toString("base64");
}
export function verifyPayload(payload: unknown, signature: string, publicPem: string) {
  try {
    if (Buffer.from(signature, "base64").length !== 64) return false;
    return verify(null, Buffer.from(canonicalJson(payload)), createPublicKey(publicPem), Buffer.from(signature, "base64"));
  } catch { return false; }
}
export function publicKeyFor(privatePem: string) {
  const key = createPrivateKey(privatePem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Runner signing key must be Ed25519");
  return createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
}
export function validateSignedBundle(input: unknown, expectedPublicKey: string, now = Date.now()) {
  const bundle = signedRunnerBundleSchema.parse(input);
  if (bundle.public_key !== expectedPublicKey || Date.parse(bundle.payload.expires_at) <= now ||
      !verifyPayload(bundle.payload, bundle.signature, expectedPublicKey)) throw new Error("Invalid or expired runner bundle");
  return bundle.payload;
}
