import { describe, expect, it } from "vitest";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { browserLocatorSchema, browserStorageStateSchema } from "../../lib/evals/contracts/browser";
import { candidateInputSchema } from "../../lib/evals/contracts/projections";
import { observationSchema, type Observation } from "../../lib/evals/contracts/results";
import { scenarioSchema, toolFixtureSchema } from "../../lib/evals/contracts/scenarios";
import { knownRecipeProposal } from "../../lib/evals/connectors/browser-executor";
import { HttpTargetAdapter } from "../../lib/evals/connectors/http-target";
import { runScenario, ScenarioFailure, toolFinalStatePasses } from "../../lib/evals/execution/scenario-runner";

const ids = {
  run: "11111111-1111-4111-8111-111111111111",
  target: "22222222-2222-4222-8222-222222222222",
  attempt: "33333333-3333-4333-8333-333333333333",
};
const context = {
  run_id: ids.run,
  target_revision_id: ids.target,
  execution_plan_id: "plan-1",
  tenant_scope_handle: "tenant-1",
  deadline: new Date(Date.now() + 10_000).toISOString(),
  attempt_id: ids.attempt,
  scoped_credential_handle: null,
  destination_policy_id: "public-https-v1",
  reserved_cost: { amount: "0", currency: "EUR" },
  signal: new AbortController().signal,
};

function observation(input: ReturnType<typeof candidateInputSchema.parse>, answer: string, toolEvents: Observation["tool_events"] = []) {
  const now = new Date().toISOString();
  const calls = toolEvents.filter((event) => event.kind === "call");
  return observationSchema.parse(withContentHash({
    schema_version: "1.0" as const,
    observation_id: `obs-${Math.random()}`,
    run_id: ids.run,
    case_revision_id: input.case_revision_id,
    repetition: 0,
    attempt_id: ids.attempt,
    target_revision_id: ids.target,
    started_at: now,
    finished_at: now,
    messages: [...input.messages, { role: "assistant" as const, content: answer, ...(calls.length ? { tool_calls: calls.map((call) => ({ call_id: call.call_id, name: call.tool_name, arguments: call.arguments })) } : {}) }],
    tool_events: toolEvents,
    artifacts: [],
    provider_request_id: null,
    status: "succeeded" as const,
    error: null,
    metadata: {
      latency_ms: { value: 1, provenance: "measured" as const },
      input_tokens: { value: null, provenance: "unavailable" as const },
      output_tokens: { value: null, provenance: "unavailable" as const },
      cost: { value: null, provenance: "unavailable" as const },
      model_identity: { value: null, provenance: "unavailable" as const },
    },
    extensions: {},
  }));
}

describe("WP-09 website execution contracts", () => {
  it("rejects executable or unbounded selectors", () => {
    expect(browserLocatorSchema.safeParse({ kind: "css", value: "button:has(script)" }).success).toBe(false);
    expect(browserLocatorSchema.safeParse({ kind: "css", value: "div{display:none}" }).success).toBe(false);
    expect(browserLocatorSchema.safeParse({ kind: "role", role: "textbox", name: null }).success).toBe(true);
  });

  it("routes captcha discovery to operator assistance", () => {
    const base = { url: "https://example.test/chat", title: "Chat", provider_hint: null, launchers: [], text_inputs: ["textarea"], message_regions: ["log"], frames: [], has_closed_shadow_hint: false };
    expect(knownRecipeProposal({ ...base, has_captcha: true })).toBeNull();
    expect(knownRecipeProposal({ ...base, has_captcha: false })).not.toBeNull();
  });

  it("bounds browser login storage and requires HTTPS origins", () => {
    expect(browserStorageStateSchema.safeParse({ cookies: [], origins: [{ origin: "http://internal.test", localStorage: [] }] }).success).toBe(false);
    expect(browserStorageStateSchema.safeParse({ cookies: [], origins: [{ origin: "https://customer.example", localStorage: [] }] }).success).toBe(true);
  });
});

describe("WP-10 multi-turn and tools", () => {
  const input = candidateInputSchema.parse({ schema_version: "1.0", case_id: "case-1", case_revision_id: "case-v1", messages: [{ role: "user", content: "What is the total?" }], attachments: [], tools: [] });

  it("runs a scripted correction turn and preserves the transcript", async () => {
    const scenario = scenarioSchema.parse({
      mode: "conversation",
      required_capabilities: ["multi_turn"],
      messages: input.messages,
      attachments: [],
      termination: { kind: "final_answer" },
      tool_fixture_set_id: null,
      turn_plan: { entry_node_id: "correction", nodes: [{ id: "correction", message: { role: "user", content: "Please correct that using the policy." }, max_visits: 1, branches: [{ condition: { kind: "always" }, next_node_id: null }] }] },
    });
    let calls = 0;
    const result = await runScenario({ scenario, candidateInput: input, fixture: null, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 0, deadlineMs: Date.now() + 5_000 }, invoke: async (next) => observation(next, ++calls === 1 ? "Incorrect" : "Corrected") });
    expect(calls).toBe(2);
    expect(result.messages.map((message) => message.content)).toContain("Please correct that using the policy.");
    expect(result.messages.at(-1)?.content).toBe("Corrected");
  });

  it("executes deterministic fixture transitions and enforces the tool budget", async () => {
    const fixture = toolFixtureSchema.parse({
      schema_version: "1.0", fixture_set_id: "orders", revision_id: "orders-v1", content_hash: "0".repeat(64), seed: 7,
      tools: [{ name: "lookup_order", description: "Look up a synthetic order", input_schema: { type: "object", required: ["id"], properties: { id: { type: "string" } }, additionalProperties: false }, output_schema: { type: "object", required: ["status"], properties: { status: { type: "string" } }, additionalProperties: false } }],
      initial_state: { checked: false }, transitions: [{ tool_name: "lookup_order", when: { kind: "always" }, result: { status: "shipped" }, next_state: { checked: true } }],
      final_state_predicates: [{ kind: "json_equals", path: "$.checked", value: true }], reset: "restore_initial_state", side_effects: "simulated_only",
    });
    const scenario = scenarioSchema.parse({ mode: "tool_workflow", required_capabilities: ["tool_calls"], messages: input.messages, attachments: [], termination: { kind: "final_answer" }, turn_plan: null, tool_fixture_set_id: "orders" });
    let calls = 0;
    const invoke = async (next: typeof input) => ++calls === 1
      ? observation(next, "", [{ kind: "call", call_id: "call-1", tool_name: "lookup_order", arguments: { id: "A-1" }, timestamp: new Date().toISOString() }])
      : observation(next, "It shipped.");
    const result = await runScenario({ scenario, candidateInput: input, fixture, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 1, deadlineMs: Date.now() + 5_000 }, invoke });
    const state = (result.extensions["caudals.evals/scenario"] as { final_state: unknown }).final_state;
    expect(toolFinalStatePasses(fixture, state, result.tool_events)).toBe(true);
    expect(result.tool_events.map((event) => event.kind)).toEqual(["call", "result"]);
    calls = 0;
    await expect(runScenario({ scenario, candidateInput: input, fixture, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 0, deadlineMs: Date.now() + 5_000 }, invoke })).rejects.toEqual(expect.objectContaining<Partial<ScenarioFailure>>({ code: "tool_budget_exhausted" }));
  });

  it("normalizes and replays OpenAI-compatible tool calls", async () => {
    const config = { schema_version: "1.0" as const, target_revision_id: ids.target, limits: { max_turns: 3, max_output_tokens: 100, max_tool_calls: 2, timeout_ms: 5_000, repetitions: 1 }, requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session" as const, kind: "openai_compatible" as const, endpoint: "https://example.test/v1/chat/completions", model: "fixture", credential: { kind: "none" as const } };
    const bodies: unknown[] = [];
    let invocation = 0;
    const adapter = new HttpTargetAdapter(config, { lookup: async () => [{ address: "93.184.216.34", family: 4 }] as never, transport: async (_destination, body) => { bodies.push(JSON.parse(Buffer.from(body).toString("utf8"))); invocation += 1; return { status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify(invocation === 1 ? { choices: [{ message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: "{\"id\":\"1\"}" } }] } }] } : { choices: [{ message: { content: "done" } }] })) }; } });
    const first = await adapter.invoke({ ...input, tools: [{ name: "lookup", description: "Lookup", input_schema: { type: "object" }, output_schema: { type: "object" } }] }, context);
    expect(first.tool_events[0]).toEqual(expect.objectContaining({ tool_name: "lookup", arguments: { id: "1" } }));
    await adapter.invoke({ ...input, messages: [...first.messages, { role: "tool", tool_call_id: "call-1", content: "{\"ok\":true}" }], tools: input.tools }, context);
    expect((bodies[1] as { messages: Array<{ tool_calls?: unknown }> }).messages.some((message) => message.tool_calls)).toBe(true);
  });
});
