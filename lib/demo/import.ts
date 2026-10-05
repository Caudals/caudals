import "server-only";
import { randomUUID } from "node:crypto";
import { addTarget, createProject, createWebsiteSource } from "@/lib/evals/repositories/evidence";
import { createEvaluation, queueConnectionCheck } from "@/lib/evals/repositories/managed";
import { queueWebsiteConnectionCheck, recordWebsiteAuthorization } from "@/lib/evals/repositories/stage-c";
import type { RunRow } from "./store";

/**
 * Turns a finished demo into the start of a real evaluation in the new
 * workspace: the project and evaluation, the same system (website chat or
 * OpenAI-compatible API, without its key), and the same site as reference
 * material. The full test set is then prepared in the product, from every
 * page, by the normal engine; the demo's eight questions stay in the demo.
 */
export async function importDemo(scope: { orgId: string; actorId: string }, run: RunRow) {
  const key = (part: string) => `demo-${run.id}-${part}`;
  const host = run.docs_host.replace(/^www\./, "");
  const title = run.locale === "es" ? `Asistente de ${host}` : `${host} assistant`;
  const description = run.locale === "es" ? `Creada desde la demo gratuita (${run.target_host}).` : `Created from the free demo (${run.target_host}).`;
  const project = await createProject(scope, { title, description }, key("project")) as { id: string };
  const evaluation = await createEvaluation(scope, { projectId: project.id, title, evidencePolicy: "source_grounded", commercialCap: "500", currency: "EUR" }, key("evaluation")) as { id: string };

  const limits = { max_turns: 10, max_output_tokens: 4_000, max_tool_calls: 10, timeout_ms: 120_000, repetitions: 1 };
  const base = { schema_version: "1.0", target_revision_id: randomUUID(), limits, requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session" };
  const config = run.target_config as { model?: string; auth?: boolean };
  const endpoint = new URL(run.target_url);
  endpoint.search = "";
  endpoint.hash = "";
  if (run.target_kind === "website") {
    const target = await addTarget(scope, project.id, { title: run.target_host, config: { ...base, kind: "website", endpoint: endpoint.href, recipe_revision_id: null, login_session_id: null } }, key("target")) as { id: string; target_id: string };
    await recordWebsiteAuthorization(scope, project.id, target.target_id, key("authorization"));
    await queueWebsiteConnectionCheck(scope, target.id, key("check"));
  } else if (run.target_kind === "openai_compatible" && config.model) {
    const target = await addTarget(scope, project.id, { title: run.target_host, config: { ...base, kind: "openai_compatible", endpoint: endpoint.href, model: config.model, credential: { kind: "none" } } }, key("target")) as { id: string };
    // A key-protected API needs its key added in Systems before it can be checked.
    if (!config.auth) await queueConnectionCheck(scope, target.id, key("check"));
  }

  const docs = new URL(run.docs_url);
  if (!docs.search && !docs.port) {
    await createWebsiteSource(scope, { evaluationId: evaluation.id, projectId: project.id, url: `${docs.origin}${docs.pathname}`, title: host, rights: "customer_owned", pageLimit: 25 }, key("source"));
  }
  return { projectId: project.id, evaluationId: evaluation.id };
}
