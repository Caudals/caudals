/** Synthetic Stage C smoke: no network, customer data, secrets or paid calls. */
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { observationSchema } from "../../lib/evals/contracts/results";
import { runScenario } from "../../lib/evals/execution/scenario-runner";
import { candidateInputSchema } from "../../lib/evals/contracts/projections";
import { scenarioSchema, toolFixtureSchema } from "../../lib/evals/contracts/scenarios";

const input = candidateInputSchema.parse({ schema_version: "1.0", case_id: "synthetic-order", case_revision_id: "synthetic-order-v1", messages: [{ role: "user", content: "Where is synthetic order A-1?" }], attachments: [], tools: [] });
const scenario = scenarioSchema.parse({ mode: "tool_workflow", required_capabilities: ["tool_calls"], messages: input.messages, attachments: [], termination: { kind: "final_answer" }, turn_plan: null, tool_fixture_set_id: "synthetic-orders" });
const fixture = toolFixtureSchema.parse({ schema_version: "1.0", fixture_set_id: "synthetic-orders", revision_id: "synthetic-orders-v1", content_hash: "0".repeat(64), seed: 1, tools: [{ name: "lookup_order", description: "Read a synthetic order", input_schema: { type: "object" }, output_schema: { type: "object" } }], initial_state: { looked_up: false }, transitions: [{ tool_name: "lookup_order", when: { kind: "always" }, result: { status: "shipped" }, next_state: { looked_up: true } }], final_state_predicates: [{ kind: "json_equals", path: "$.looked_up", value: true }], reset: "restore_initial_state", side_effects: "simulated_only" });
async function main() {
let turn = 0;
const result = await runScenario({ scenario, candidateInput: input, fixture, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 1, deadlineMs: Date.now() + 5_000 }, invoke: async (candidate) => {
  turn += 1; const now = new Date().toISOString(); const call = { kind: "call" as const, call_id: "synthetic-call-1", tool_name: "lookup_order", arguments: { id: "A-1" }, timestamp: now };
  return observationSchema.parse(withContentHash({ schema_version: "1.0", observation_id: `synthetic-observation-${turn}`, run_id: "synthetic-run", case_revision_id: candidate.case_revision_id, repetition: 0, attempt_id: "synthetic-attempt", target_revision_id: "synthetic-target", started_at: now, finished_at: now, messages: [...candidate.messages, { role: "assistant" as const, content: turn === 1 ? "" : "Synthetic order A-1 shipped.", ...(turn === 1 ? { tool_calls: [{ call_id: call.call_id, name: call.tool_name, arguments: call.arguments }] } : {}) }], tool_events: turn === 1 ? [call] : [], artifacts: [], provider_request_id: null, status: "succeeded", error: null, metadata: { latency_ms: { value: 1, provenance: "measured" }, input_tokens: { value: null, provenance: "unavailable" }, output_tokens: { value: null, provenance: "unavailable" }, cost: { value: null, provenance: "unavailable" }, model_identity: { value: "synthetic", provenance: "measured" } }, extensions: {} }));
} });
console.log(JSON.stringify({ synthetic: true, turns: turn, toolEvents: result.tool_events.length, final: result.messages.at(-1)?.content, contentHash: result.content_hash }, null, 2));
}

main().catch(() => {
  console.error("Synthetic Stage C demo failed.");
  process.exitCode = 1;
});
