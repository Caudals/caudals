import { z } from "zod";
import {
  hashSchema,
  idSchema,
  schemaVersionSchema,
  timestampSchema,
} from "./primitives";

export const browserLocatorSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("role"),
    role: z.enum(["button", "textbox", "dialog", "status", "log"]),
    name: z.string().min(1).max(200).nullable(),
  }),
  z.strictObject({
    kind: z.literal("label"),
    text: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal("test_id"),
    value: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal("css"),
    // CSS is data, not script. Keep recipes deliberately small and reject
    // pseudo selectors capable of selecting unrelated page text.
    value: z
      .string()
      .min(1)
      .max(500)
      .refine(
        (value) =>
          !/[{};]/.test(value) &&
          !/:has\(|:contains\(|script|style|link|meta|object|embed/i.test(value),
        "Bounded element selector required",
      ),
  }),
]);

export const websiteRecipeSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    recipe_revision_id: idSchema,
    content_hash: hashSchema,
    source: z.enum(["known_recipe", "model_proposed", "operator_authored"]),
    start_url: z
      .url()
      .refine((value) => new URL(value).protocol === "https:"),
    launcher: browserLocatorSchema.nullable(),
    frame_chain: z.array(browserLocatorSchema).max(8),
    input: browserLocatorSchema,
    submit: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("press_enter") }),
      z.strictObject({ kind: z.literal("click"), locator: browserLocatorSchema }),
    ]),
    message_container: browserLocatorSchema,
    assistant_message: browserLocatorSchema,
    completion: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("text_stable"),
        stable_ms: z.number().int().min(250).max(5_000),
      }),
      z.strictObject({
        kind: z.literal("selector_hidden"),
        locator: browserLocatorSchema,
      }),
      z.strictObject({
        kind: z.literal("send_enabled"),
        locator: browserLocatorSchema,
      }),
    ]),
    reset: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("new_context") }),
      z.strictObject({ kind: z.literal("click"), locator: browserLocatorSchema }),
      z.strictObject({ kind: z.literal("unsupported") }),
    ]),
    assistant_extraction: z.enum(["last_new_message", "last_message"]),
    created_at: timestampSchema,
    extensions: z.record(z.string(), z.unknown()),
  })
  .superRefine((recipe, context) => {
    const start = new URL(recipe.start_url);
    if (start.username || start.password || start.hash) {
      context.addIssue({
        code: "custom",
        message: "Recipe URL cannot contain credentials or a fragment",
      });
    }
  });

export function assertWebsiteRecipeOrigin(startUrl: string, authorizedEndpoint: string) {
  if (new URL(startUrl).origin !== new URL(authorizedEndpoint).origin) {
    throw new Error("website_recipe_origin_mismatch");
  }
}

export const browserDiscoverySnapshotSchema = z.strictObject({
  url: z.url(),
  title: z.string().max(500),
  provider_hint: z.string().max(100).nullable(),
  launchers: z.array(z.string().max(500)).max(25),
  text_inputs: z.array(z.string().max(500)).max(25),
  message_regions: z.array(z.string().max(500)).max(25),
  frames: z.array(z.string().max(500)).max(20),
  has_closed_shadow_hint: z.boolean(),
  has_captcha: z.boolean(),
});

export const browserProbeEvidenceSchema = z.strictObject({
  checked_at: timestampSchema,
  messages: z.tuple([
    z.strictObject({ prompt_hash: hashSchema, response_hash: hashSchema }),
    z.strictObject({ prompt_hash: hashSchema, response_hash: hashSchema }),
  ]),
  distinct_responses: z.boolean(),
  reset_verified: z.boolean(),
  streaming_complete: z.boolean(),
  duplicate_free: z.boolean(),
  screenshot_artifact_id: idSchema.nullable(),
  trace_artifact_id: idSchema.nullable(),
});

export const browserStorageStateSchema = z.strictObject({
  cookies: z.array(z.strictObject({
    name: z.string().min(1).max(500),
    value: z.string().max(20_000),
    domain: z.string().min(1).max(500),
    path: z.string().min(1).max(2_000),
    expires: z.number(),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    sameSite: z.enum(["Strict", "Lax", "None"]),
  })).max(200),
  origins: z.array(z.strictObject({
    origin: z.string().url().refine((value) => new URL(value).protocol === "https:"),
    localStorage: z.array(z.strictObject({ name: z.string().max(500), value: z.string().max(50_000) })).max(200),
  })).max(20),
});

/** A captured login may only preload state for the attested website. */
export function scopedBrowserStorageState(raw: unknown, authorizedUrl: string): BrowserStorageState {
  const state = browserStorageStateSchema.parse(raw);
  const host = new URL(authorizedUrl).hostname.toLowerCase();
  if (state.cookies.some((cookie) => cookie.domain.replace(/^\./, "").toLowerCase() !== host)) {
    throw new Error("browser_session_scope_mismatch");
  }
  if (state.origins.some((origin) => new URL(origin.origin).origin !== new URL(authorizedUrl).origin)) {
    throw new Error("browser_session_scope_mismatch");
  }
  return state;
}

export type BrowserLocator = z.infer<typeof browserLocatorSchema>;
export type WebsiteRecipe = z.infer<typeof websiteRecipeSchema>;
export type BrowserDiscoverySnapshot = z.infer<
  typeof browserDiscoverySnapshotSchema
>;
export type BrowserProbeEvidence = z.infer<typeof browserProbeEvidenceSchema>;
export type BrowserStorageState = z.infer<typeof browserStorageStateSchema>;
