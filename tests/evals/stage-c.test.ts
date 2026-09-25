import { describe, expect, it } from "vitest";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { assertWebsiteRecipeOrigin, browserLocatorSchema, browserStorageStateSchema, scopedBrowserStorageState } from "../../lib/evals/contracts/browser";
import { candidateInputSchema } from "../../lib/evals/contracts/projections";
import { observationSchema, type Observation } from "../../lib/evals/contracts/results";
import { scenarioSchema, toolFixtureSchema } from "../../lib/evals/contracts/scenarios";
import { assertScorableWebsiteRecipe, knownRecipeProposal, newAssistantMessages } from "../../lib/evals/connectors/browser-executor";
import { HttpTargetAdapter } from "../../lib/evals/connectors/http-target";
import { runScenario, ScenarioFailure, toolFinalStatePasses } from "../../lib/evals/execution/scenario-runner";
import { assertApprovedRunSelection, assertOperatorRecipeAuthority, assertReadyConnection, assertRegressionEligible, assertRegressionReleaseCandidate, assertWebsiteAuthorization } from "../../lib/evals/repositories/stage-c";
import { caseSchema } from "../../lib/evals/contracts/cases";
import { genericGroundedQaPack, syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { withGenerationSlot } from "../../lib/evals/repositories/managed";
import { customerPreparationView } from "../../lib/evals/domain/preparation-view";
import { customerRunView } from "../../lib/evals/domain/run-view";
import { customerWorkspaceView } from "../../lib/evals/domain/workspace-view";
import { assertReleasedRegressionRevision } from "../../lib/evals/repositories/evidence";

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

describe("browser login-state scope", () => {
  const state = {
    cookies: [{ name: "session", value: "fixture", domain: "chat.example.test", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const }],
    origins: [{ origin: "https://chat.example.test", localStorage: [{ name: "login", value: "fixture" }] }],
  };
  it("accepts only state for the attested origin", () => {
    expect(scopedBrowserStorageState(state, "https://chat.example.test/support")).toEqual(state);
    expect(() => scopedBrowserStorageState({ ...state, cookies: [{ ...state.cookies[0], domain: ".example.test" }] }, "https://chat.example.test/support")).toThrow("browser_session_scope_mismatch");
    expect(() => scopedBrowserStorageState({ ...state, origins: [{ ...state.origins[0], origin: "https://other.example.test" }] }, "https://chat.example.test/support")).toThrow("browser_session_scope_mismatch");
    expect(() => scopedBrowserStorageState(state, "https://chat.example.test:8443/support")).toThrow("browser_session_scope_mismatch");
  });
});

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

describe("WP-11 approved test-set gate", () => {
  const approved = { preparation_status: "ready", selected_suite_version_id: "suite-v1" };
  it("rejects a draft or a different suite, even when a caller supplies its ID", () => {
    expect(() => assertApprovedRunSelection({ ...approved, preparation_status: "needs_review" }, "suite-v1")).toThrow();
    expect(() => assertApprovedRunSelection(approved, "suite-v2")).toThrow();
    expect(() => assertApprovedRunSelection({ ...approved, selected_suite_version_id: null }, undefined)).toThrow();
    expect(() => assertApprovedRunSelection(approved, undefined)).not.toThrow();
  });
  it("does not author a source-backed case against an absent excerpt", () => {
    const source = syntheticAccountingFixture().source;
    expect(() => genericGroundedQaPack({ source, authorId: "fixture", questions: [{ question: "What is the fee?", expected: "10%", anchor: "not-an-anchor" }] })).toThrow(/anchor/i);
  });
  it("requires a ready connection check bound to the chosen revision", () => {
    expect(() => assertReadyConnection("openai_compatible", null, null)).toThrow();
    expect(() => assertReadyConnection("openai_compatible", { status: "failed" }, null)).toThrow();
    expect(() => assertReadyConnection("openai_compatible", { status: "ready" }, null)).not.toThrow();
    expect(() => assertReadyConnection("website", null, null)).toThrow();
    expect(() => assertReadyConnection("website", null, { id: "recipe-v1" })).not.toThrow();
  });
  it("keeps assisted browser recipe submission with operators", () => {
    expect(() => assertOperatorRecipeAuthority(null)).toThrow();
    expect(() => assertOperatorRecipeAuthority("operator")).not.toThrow();
    expect(() => assertOperatorRecipeAuthority("platform_admin")).not.toThrow();
  });
  it("rejects website checks without an active endpoint-matched attestation", () => {
    const endpoint = "https://example.com/chat";
    const active = { scope: { endpoint }, expires_at: new Date(Date.now() + 60_000) };
    expect(() => assertWebsiteAuthorization(null, endpoint)).toThrow();
    expect(() => assertWebsiteAuthorization({ ...active, scope: { endpoint: "https://other.example/chat" } }, endpoint)).toThrow();
    expect(() => assertWebsiteAuthorization({ ...active, expires_at: new Date(Date.now() - 1_000) }, endpoint)).toThrow();
    expect(() => assertWebsiteAuthorization(active, endpoint)).not.toThrow();
  });
  it("bounds nested draft preparation to available database connections", async () => {
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 5 }, (_, index) => withGenerationSlot(async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return index;
    })));
    expect(peak).toBeLessThanOrEqual(2);
  });
  it("does not expose generation batches or operator diagnostics to customers", () => {
    const view = customerPreparationView({
      evaluation: { preparation_status: "needs_review", reason_code: "generation_validation_failed" },
      questions: [{ id: "question-1", field: "purpose", question: "What is the purpose?", critical: true, status: "open", answer: { private: true } }],
      batches: [{ status: "completed", output: { suiteId: "suite-1", suiteVersionId: "version-1" }, prompt_revision: "private-prompt", input_hash: "private-hash" }],
      quarantine: [{ schema_errors: ["private-diagnostic"] }],
      profiles: [{ model_revision_id: "private-model" }],
      casePreviews: [{ caseRevisionId: "case-1", question: "Q?", approvedAnswer: "A.", sourceExcerpt: "Source." }],
    });
    expect(view.draft).toMatchObject({ suiteId: "suite-1", suiteVersionId: "version-1" });
    expect(view.questions).toEqual([{ id: "question-1", field: "purpose", question: "What is the purpose?", critical: true, status: "open" }]);
    expect(JSON.stringify(view)).not.toMatch(/private-prompt|private-hash|private-diagnostic|private-model|private/);
  });
  it("projects customer run progress without internal plans, costs or observations", () => {
    const view = customerRunView({
      run: { id: "run-1", status: "paused", phase: "preflight", execution_mode: "imported_responses", suite_version_id: "suite-1", created_at: "now", reason_code: null, commercial_cap: "secret" },
      units: [{ id: "unit-1", status: "pending", observation: { private: "answer" }, attempt_id: "private-attempt" }],
      plan: { document: { private: "plan" } },
      costs: { reserved: "private-cost" },
      targetUsage: { calls: 2, unknown: 1 },
      events: [{ private: "event" }],
    });
    expect(view.run).toMatchObject({ id: "run-1", status: "paused", execution_mode: "imported_responses" });
    expect(view.units).toEqual([{ id: "unit-1", status: "pending" }]);
    expect(view.targetUsage).toEqual({ calls: 2, unknown: 1 });
    expect(JSON.stringify(view)).not.toMatch(/secret|answer|attempt|plan|cost|event/);
  });
  it("projects workspace systems without connector credentials or operator-only fields", () => {
    const view = customerWorkspaceView({
      evaluations: [{ id: "eval-1", title: "Fixture", project_id: "project-1", source_ids: ["document-source", "website-source"], internal_note: "private-note" }],
      systems: [{ id: "target-1", project_id: "project-1", title: "Fixture", target_revision_id: "revision-1", document: { kind: "website", endpoint: "https://example.test", login_session_id: "private-session" }, capability_report: "private-capabilities" }],
      reports: [],
      entitlement: { max_active_runs: 1, monthly_spend_limit: "10", currency: "EUR", allowed_connection_types: ["website"], can_export: true, internal_grant: "private-grant" },
      usage: { settled: "0", outstanding: "0", internal_cost: "private-cost" },
      preferences: { completion: true, required_input: true, failure: true, email: false },
    });
    expect(view.evaluations[0].source_ids).toEqual(["document-source", "website-source"]);
    expect(view.systems[0].document).toEqual({ kind: "website" });
    expect(JSON.stringify(view)).not.toMatch(/private-|endpoint|capability_report/);
  });
});

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

  it("flags duplicate new assistant messages instead of grading one copy", () => {
    expect(newAssistantMessages(["old"], ["old", "new", "new"])).toEqual({ messages: ["new", "new"], duplicateFree: false });
    expect(newAssistantMessages(["old"], ["old", "new"])).toEqual({ messages: ["new"], duplicateFree: true });
  });
  it("requires a widget completion signal for scored browser runs", () => {
    expect(() => assertScorableWebsiteRecipe({ completion: { kind: "text_stable", stable_ms: 500 } } as Parameters<typeof assertScorableWebsiteRecipe>[0])).toThrow("website_completion_unverified");
    expect(() => assertScorableWebsiteRecipe({ completion: { kind: "selector_hidden", locator: { kind: "css", value: ".busy" } } } as Parameters<typeof assertScorableWebsiteRecipe>[0])).not.toThrow();
  });
  it("does not let a proposed recipe probe an unapproved origin", () => {
    expect(() => assertWebsiteRecipeOrigin("https://widgets.example.test/chat", "https://customer.example.test/support")).toThrow("website_recipe_origin_mismatch");
    expect(() => assertWebsiteRecipeOrigin("https://customer.example.test/chat", "https://customer.example.test/support")).not.toThrow();
  });
});

describe("WP-10 multi-turn and tools", () => {
  it("only opens a regression draft for a failed interaction", () => {
    expect(() => assertRegressionEligible({ execution_status: "succeeded", latest_outcome: "pass" })).toThrow();
    expect(() => assertRegressionEligible({ execution_status: "succeeded", latest_outcome: null })).toThrow();
    expect(() => assertRegressionEligible({ execution_status: "succeeded", latest_outcome: "partial" })).not.toThrow();
    expect(() => assertRegressionEligible({ execution_status: "transport_error", latest_outcome: null })).toThrow();
  });
  it("requires a new source-backed, reviewer-linked case before regression release", () => {
    const source = syntheticAccountingFixture().cases[0];
    const regressionId = "regression-1";
    const observationId = "observation-1";
    const actorId = "operator-1";
    const candidate = caseSchema.parse(withContentHash({
      ...source,
      revision_id: "new-revision-1",
      title: "Redacted regression question",
      provenance: { ...source.provenance, method: "human_authored", evidence_level: "expert_reviewed", reviewer_ids: [actorId] },
      extensions: { "caudals.evals/regression": { regression_case_id: regressionId, source_observation_id: observationId, source_case_revision_id: source.revision_id } },
    }));
    const args = { candidate, source, regressionId, observationId, actorId };
    expect(() => assertRegressionReleaseCandidate(args)).not.toThrow();
    expect(() => assertRegressionReleaseCandidate({ ...args, candidate: { ...candidate, extensions: {} } })).toThrow();
    expect(() => assertRegressionReleaseCandidate({ ...args, candidate: { ...candidate, provenance: { ...candidate.provenance, reviewer_ids: [] } } })).toThrow();
    expect(() => assertRegressionReleaseCandidate({ ...args, candidate: { ...candidate, revision_id: source.revision_id } })).toThrow();
    expect(() => assertRegressionReleaseCandidate({ ...args, candidate: { ...candidate, title: "alice@example.com" } })).toThrow();
    expect(() => assertReleasedRegressionRevision(candidate, undefined)).toThrow();
    expect(() => assertReleasedRegressionRevision(candidate, { draft_case_revision_id: candidate.revision_id, redaction_status: "pending", validation_status: "valid" })).toThrow();
    expect(() => assertReleasedRegressionRevision(candidate, { draft_case_revision_id: candidate.revision_id, redaction_status: "redacted", validation_status: "valid" })).not.toThrow();
  });
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

  it("rejects a later response assigned to another case or run", async () => {
    const scenario = scenarioSchema.parse({
      mode: "conversation", required_capabilities: ["multi_turn"], messages: input.messages, attachments: [], termination: { kind: "final_answer" }, tool_fixture_set_id: null,
      turn_plan: { entry_node_id: "clarify", nodes: [{ id: "clarify", message: { role: "user", content: "The order number is A-1." }, max_visits: 1, branches: [{ condition: { kind: "always" }, next_node_id: null }] }] },
    });
    let calls = 0;
    await expect(runScenario({ scenario, candidateInput: input, fixture: null, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 0, deadlineMs: Date.now() + 5_000 }, invoke: async (next) => {
      calls += 1;
      const result = observation(next, calls === 1 ? "What is your order number?" : "Order found.");
      return calls === 2 ? observationSchema.parse(withContentHash({ ...result, case_revision_id: "another-case", run_id: "another-run" })) : result;
    } })).rejects.toMatchObject({ code: "scenario_identity_mismatch" });
  });

  it("continues after a missing-information clarification", async () => {
    const scenario = scenarioSchema.parse({
      mode: "conversation", required_capabilities: ["multi_turn"], messages: input.messages, attachments: [], termination: { kind: "final_answer" }, tool_fixture_set_id: null,
      turn_plan: { entry_node_id: "order-id", nodes: [{ id: "order-id", message: { role: "user", content: "The order number is A-1." }, max_visits: 1, branches: [{ condition: { kind: "text_contains", value: "order number" }, next_node_id: null }] }] },
    });
    let calls = 0;
    const result = await runScenario({ scenario, candidateInput: input, fixture: null, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 0, deadlineMs: Date.now() + 5_000 }, invoke: async (next) => observation(next, ++calls === 1 ? "What is your order number?" : "Order A-1 was shipped.") });
    expect(calls).toBe(2);
    expect(result.messages.at(-1)?.content).toContain("shipped");
  });

  it("stops a conversation when its cumulative output-token budget is spent", async () => {
    const scenario = scenarioSchema.parse({
      mode: "conversation", required_capabilities: ["multi_turn"], messages: input.messages, attachments: [], termination: { kind: "final_answer" }, tool_fixture_set_id: null,
      turn_plan: { entry_node_id: "followup", nodes: [{ id: "followup", message: { role: "user", content: "Continue." }, max_visits: 1, branches: [{ condition: { kind: "always" }, next_node_id: null }] }] },
    });
    await expect(runScenario({ scenario, candidateInput: input, fixture: null, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 0, maxOutputTokens: 1, deadlineMs: Date.now() + 5_000 }, invoke: async (next) => observation(next, "This answer is far longer than one token.") })).rejects.toMatchObject({ code: "token_budget_exhausted" });
  });

  it("replays a deterministic tool error and permits a bounded recovery", async () => {
    const fixture = toolFixtureSchema.parse({
      schema_version: "1.0", fixture_set_id: "orders", revision_id: "orders-recovery-v1", content_hash: "0".repeat(64), seed: 1,
      tools: [{ name: "lookup", description: "Synthetic lookup", input_schema: { type: "object", required: ["id"], properties: { id: { type: "string" } }, additionalProperties: false }, output_schema: { type: "object" } }],
      initial_state: { recovered: false },
      transitions: [
        { tool_name: "lookup", when: { kind: "json_equals", path: "$.id", value: "first" }, result: { error: "temporary" }, next_state: { recovered: false } },
        { tool_name: "lookup", when: { kind: "json_equals", path: "$.id", value: "retry" }, result: { status: "shipped" }, next_state: { recovered: true } },
      ],
      final_state_predicates: [{ kind: "json_equals", path: "$.recovered", value: true }], reset: "restore_initial_state", side_effects: "simulated_only",
    });
    const scenario = scenarioSchema.parse({ mode: "tool_workflow", required_capabilities: ["tool_calls"], messages: input.messages, attachments: [], termination: { kind: "final_answer" }, turn_plan: null, tool_fixture_set_id: "orders" });
    let calls = 0;
    const result = await runScenario({ scenario, candidateInput: input, fixture, repetition: 0, limits: { maxTurns: 3, maxToolCalls: 2, deadlineMs: Date.now() + 5_000 }, invoke: async (next) => {
      calls += 1;
      return calls < 3 ? observation(next, "", [{ kind: "call", call_id: `call-${calls}`, tool_name: "lookup", arguments: { id: calls === 1 ? "first" : "retry" }, timestamp: new Date().toISOString() }]) : observation(next, "Order shipped.");
    } });
    expect(result.tool_events.map((event) => event.kind)).toEqual(["call", "result", "call", "result"]);
    expect(toolFinalStatePasses(fixture, (result.extensions["caudals.evals/scenario"] as { final_state: unknown }).final_state, result.tool_events)).toBe(true);
    expect(calls).toBe(3);
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
