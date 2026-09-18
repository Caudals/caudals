import { z } from "zod";

export const schemaVersionSchema = z.literal("1.0");
export const idSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const timestampSchema = z.iso.datetime({ offset: false });
const grandfatheredLanguageTags = new Set(["art-lojban", "cel-gaulish", "en-gb-oed", "i-ami", "i-bnn", "i-default", "i-enochian", "i-hak", "i-klingon", "i-lux", "i-mingo", "i-navajo", "i-pwn", "i-tao", "i-tay", "i-tsu", "no-bok", "no-nyn", "sgn-be-fr", "sgn-be-nl", "sgn-ch-de", "zh-guoyu", "zh-hakka", "zh-min", "zh-min-nan", "zh-xiang"]);
export const languageSchema = z.string().min(2).max(80).refine((value) => {
  if (/^x(?:-[a-z0-9]{1,8})+$/i.test(value) || grandfatheredLanguageTags.has(value.toLowerCase())) return true;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}, "Expected a BCP 47 language tag");
export const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const nonnegativeDecimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const moneySchema = z.strictObject({ amount: nonnegativeDecimalSchema, currency: currencySchema });
export const splitSchema = z.enum(["development", "validation", "holdout", "training"]);
export const capabilitySchema = z.enum(["text", "documents", "multi_turn", "tool_calls", "tool_traces", "retrieved_context", "usage", "streaming", "session_reset", "remote_cancel"]);
export const jsonValueSchema = z.json();
export const extensionsSchema = z.record(z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+\/[A-Za-z0-9._-]+$/), jsonValueSchema);
// Portable archive paths: no decoding, platform-dependent separators or dot segments.
export const safePathSchema = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/).refine(
  (value) => value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !part.endsWith(".") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
  "Unsafe relative archive path",
);
export const selectorSchema = z.string().max(256).regex(/^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[(?:0|[1-9]\d*)\])*$/);
export const limitsSchema = z.strictObject({
  max_turns: z.int().min(1).max(1000), max_output_tokens: z.int().min(1).max(10_000_000),
  max_tool_calls: z.int().min(0).max(10000), timeout_ms: z.int().min(1).max(86_400_000), repetitions: z.int().min(1).max(1000),
});
export const messageToolCallSchema = z.strictObject({
  call_id: idSchema,
  name: idSchema,
  arguments: jsonValueSchema,
});
export const messageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().max(2_000_000),
  tool_call_id: idSchema.optional(),
  tool_calls: z.array(messageToolCallSchema).max(100).optional(),
});
export const sourceRefSchema = z.strictObject({ source_revision_id: idSchema, anchor: idSchema });
export const artifactSchema = z.strictObject({ path: safePathSchema, sha256: hashSchema, size_bytes: z.int().nonnegative(), media_type: z.string().min(1), visibility: z.enum(["candidate", "judge", "customer", "internal", "public"]) });
export const revisionRefSchema = z.strictObject({ revision_id: idSchema, content_hash: hashSchema });
export const rightsSchema = z.enum(["caudals_owned_synthetic", "caudals_owned", "customer_owned", "licensed", "public_domain"]);
export const accessSchema = z.strictObject({ candidate: z.boolean(), judge: z.boolean(), customer: z.boolean(), public: z.boolean() });
