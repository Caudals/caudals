import "server-only";
import { z } from "zod";
import { demoEndpoint, demoProviderKey, fallbackDemoModels, safeDemoSecret } from "@/lib/demo/model-settings";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import { asAdmin, requirePlatformAdmin } from "./platform";

/** Uses the demo's configured provider; no credentials or private endpoints are returned. */
export async function getDemoSettings(identity: EvalIdentity, orgId: string) {
  requirePlatformAdmin(identity);
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    const { rows } = await c.query<{ model_id: string }>("SELECT model_id FROM demo.model_setting WHERE provider_key=$1", [demoProviderKey()]);
    const host = new URL(demoEndpoint()).hostname;
    return { modelId: rows[0]?.model_id ?? fallbackDemoModels()[0], provider: host === "openrouter.ai" ? "OpenRouter" : "DGX Spark / OpenAI-compatible API" };
  });
}

const catalogSchema = z.object({ data: z.array(z.object({
  id: z.string().min(1).max(200), name: z.string().optional(),
  pricing: z.object({ prompt: z.string(), completion: z.string() }).catchall(z.string()),
  architecture: z.object({ output_modalities: z.array(z.string()) }).optional(),
})).max(5000) });

export async function listDemoModels(identity: EvalIdentity) {
  requirePlatformAdmin(identity);
  try {
    const endpoint = demoEndpoint();
    const openRouter = new URL(endpoint).hostname === "openrouter.ai";
    const key = safeDemoSecret("DEMO_API_KEY") ?? safeDemoSecret("DEMO_OPENROUTER_API_KEY");
    const response = await fetch(endpoint.replace(/\/chat\/completions$/, "/models"), {
      signal: AbortSignal.timeout(10_000), cache: "no-store",
      headers: key && (openRouter || !endpoint.includes("192.168.")) ? { authorization: `Bearer ${key}` } : {},
    });
    if (!response.ok) throw new Error("catalog_unavailable");
    const body: unknown = await response.json();
    if (!openRouter) return z.object({ data: z.array(z.object({ id: z.string().min(1).max(200) })).max(5000) }).parse(body).data
      .filter((model) => !/embed/i.test(model.id))
      .map((model) => ({ id: model.id, label: model.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return catalogSchema.parse(body).data
      .filter((model) => Object.values(model.pricing).every((price) => price.trim() !== "" && Number(price) === 0)
        && (!model.architecture || model.architecture.output_modalities.includes("text")))
      .map((model) => ({ id: model.id, label: model.name ?? model.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Could not list models from the demo provider. Check its connection and try again.");
  }
}

export async function setDemoModel(identity: EvalIdentity, orgId: string, raw: unknown) {
  requirePlatformAdmin(identity);
  const { modelId } = z.strictObject({ modelId: z.string().trim().min(1).max(200) }).parse(raw);
  const models = await listDemoModels(identity);
  if (!models.some((model) => model.id === modelId)) throw new EvalError("INPUT_INVALID", 422, "Choose an available model from the demo provider.");
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    await c.query(`INSERT INTO demo.model_setting(provider_key,model_id,updated_by) VALUES($1,$2,$3)
      ON CONFLICT(provider_key) DO UPDATE SET model_id=excluded.model_id,updated_by=excluded.updated_by,updated_at=now()`, [demoProviderKey(), modelId, identity.user.id]);
    await c.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'engine.demo.model',$3)", [orgId, identity.user.id, modelId]);
    return { modelId };
  });
}
