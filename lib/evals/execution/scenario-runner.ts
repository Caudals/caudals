import { randomUUID } from "node:crypto";
import type { CandidateInput } from "../contracts/projections";
import type { Observation } from "../contracts/results";
import type {
  conditionSchema,
  scenarioSchema,
  toolFixtureSchema,
} from "../contracts/scenarios";
import { observationSchema } from "../contracts/results";
import { canonicalJson, withContentHash } from "../contracts/hashing";
import { selectJson } from "../connectors/json-mapping";
import type { z } from "zod";

type Scenario = z.infer<typeof scenarioSchema>;
type ToolFixture = z.infer<typeof toolFixtureSchema>;
type Condition = z.infer<typeof conditionSchema>;
type Invoke = (input: CandidateInput) => Promise<Observation>;

export type ScenarioLimits = {
  maxTurns: number;
  maxToolCalls: number;
  maxOutputTokens?: number;
  deadlineMs: number;
};

export class ScenarioFailure extends Error {
  constructor(
    public readonly code:
      | "turn_budget_exhausted"
      | "tool_budget_exhausted"
      | "scenario_timeout"
      | "scenario_branch_missing"
      | "scenario_identity_mismatch"
      | "scenario_transcript_mismatch"
      | "target_observation_incomplete"
      | "token_budget_exhausted"
      | "tool_schema_invalid"
      | "tool_transition_missing",
  ) {
    super(code);
  }
}

function equal(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function conditionMatches(
  condition: Condition,
  args: {
    text: string;
    value: unknown;
    calledTools: Set<string>;
  },
) {
  if (condition.kind === "always") return true;
  if (condition.kind === "text_contains") {
    return args.text
      .toLocaleLowerCase()
      .includes(condition.value.toLocaleLowerCase());
  }
  if (condition.kind === "tool_called") {
    return args.calledTools.has(condition.tool_name);
  }
  return equal(selectJson(args.value, condition.path), condition.value);
}

export function conditionsPass(
  conditions: Condition[],
  state: unknown,
  events: Observation["tool_events"],
) {
  const calledTools = new Set(
    events.filter((event) => event.kind === "call").map((event) => event.tool_name),
  );
  return conditions.every((condition) =>
    conditionMatches(condition, {
      text: JSON.stringify(state),
      value: state,
      calledTools,
    }),
  );
}

function jsonType(value: unknown, type: unknown) {
  if (type === "object") return !!value && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function schemaMatches(value: unknown, schema: Record<string, unknown>): boolean {
  if (schema.type && !jsonType(value, schema.type)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => equal(item, value))) {
    return false;
  }
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    if (
      Array.isArray(schema.required) &&
      schema.required.some((key) => typeof key !== "string" || !(key in record))
    ) {
      return false;
    }
    if (
      schema.additionalProperties === false &&
      Object.keys(record).some((key) => !(key in properties))
    ) {
      return false;
    }
    return Object.entries(properties).every(
      ([key, child]) => !(key in record) || schemaMatches(record[key], child),
    );
  }
  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    return value.every((item) =>
      schemaMatches(item, schema.items as Record<string, unknown>),
    );
  }
  return true;
}

function lastAssistant(observation: Observation) {
  return [...observation.messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content ?? "";
}

function parsed(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function fixtureTransition(
  fixture: ToolFixture,
  state: unknown,
  toolName: string,
  args: unknown,
) {
  const definition = fixture.tools.find((tool) => tool.name === toolName);
  if (!definition || !schemaMatches(args, definition.input_schema)) {
    throw new ScenarioFailure("tool_schema_invalid");
  }
  const called = new Set([toolName]);
  const transition = fixture.transitions.find(
    (candidate) =>
      candidate.tool_name === toolName &&
      conditionMatches(candidate.when, {
        text: JSON.stringify(args),
        value: args,
        calledTools: called,
      }),
  );
  if (!transition) throw new ScenarioFailure("tool_transition_missing");
  if (!schemaMatches(transition.result, definition.output_schema)) {
    throw new ScenarioFailure("tool_schema_invalid");
  }
  return { result: transition.result, state: transition.next_state ?? state };
}

/**
 * Runs a frozen scenario using only scripted turns and deterministic fixtures.
 * The invoke callback owns target transport. This runner never grants network,
 * filesystem, publication, spend, or secret authority to model output.
 */
export async function runScenario(args: {
  scenario: Scenario;
  candidateInput: CandidateInput;
  fixture?: ToolFixture | null;
  invoke: Invoke;
  limits: ScenarioLimits;
  repetition: number;
}): Promise<Observation> {
  const startedAt = new Date().toISOString();
  let messages = [...args.candidateInput.messages];
  let state: unknown = args.fixture?.initial_state ?? null;
  const toolEvents: Observation["tool_events"] = [];
  const artifacts: Observation["artifacts"] = [];
  const calledTools = new Set<string>();
  const visits = new Map<string, number>();
  let nodeId = args.scenario.turn_plan?.entry_node_id ?? null;
  let turns = 0;
  let toolCalls = 0;
  let outputTokens = 0;
  let tokenUsageEstimated = false;
  let last: Observation | null = null;
  let identity: { runId: string; targetRevisionId: string; attemptId: string } | null = null;

  while (true) {
    if (Date.now() >= args.limits.deadlineMs) {
      throw new ScenarioFailure("scenario_timeout");
    }
    if (turns >= args.limits.maxTurns) {
      throw new ScenarioFailure("turn_budget_exhausted");
    }
    const input: CandidateInput = {
      ...args.candidateInput,
      messages,
      tools: args.fixture?.tools ?? args.candidateInput.tools,
    };
    const observation = await args.invoke(input);
    if (observation.case_revision_id !== args.candidateInput.case_revision_id || (identity && (
      observation.run_id !== identity.runId ||
      observation.target_revision_id !== identity.targetRevisionId ||
      observation.attempt_id !== identity.attemptId
    ))) throw new ScenarioFailure("scenario_identity_mismatch");
    if (!equal(observation.messages.slice(0, input.messages.length), input.messages)) {
      throw new ScenarioFailure("scenario_transcript_mismatch");
    }
    if (observation.status !== "succeeded") throw new ScenarioFailure("target_observation_incomplete");
    const reportedTokens = observation.metadata.output_tokens.value;
    if (reportedTokens === null) tokenUsageEstimated = true;
    // Browser widgets may not expose usage; this byte-based estimate is an
    // approximate local stop, never a provider-reported token count.
    outputTokens += reportedTokens ?? Math.max(1, Math.ceil(Buffer.byteLength(lastAssistant(observation), "utf8") / 4));
    if (args.limits.maxOutputTokens !== undefined && outputTokens > args.limits.maxOutputTokens) {
      throw new ScenarioFailure("token_budget_exhausted");
    }
    identity ??= { runId: observation.run_id, targetRevisionId: observation.target_revision_id, attemptId: observation.attempt_id };
    last = observation;
    turns += 1;
    const responseMessages = last.messages.slice(input.messages.length);
    messages = [...messages, ...responseMessages];
    artifacts.push(...last.artifacts);

    const calls = last.tool_events.filter((event) => event.kind === "call");
    if (calls.length) {
      if (!args.fixture) throw new ScenarioFailure("tool_transition_missing");
      for (const call of calls) {
        if (toolCalls >= args.limits.maxToolCalls) {
          throw new ScenarioFailure("tool_budget_exhausted");
        }
        toolCalls += 1;
        calledTools.add(call.tool_name);
        toolEvents.push(call);
        const transition = fixtureTransition(
          args.fixture,
          state,
          call.tool_name,
          call.arguments,
        );
        state = transition.state;
        const resultEvent = {
          kind: "result" as const,
          call_id: call.call_id,
          result: transition.result,
          timestamp: new Date().toISOString(),
        };
        toolEvents.push(resultEvent);
        messages.push({
          role: "tool",
          tool_call_id: call.call_id,
          content: JSON.stringify(transition.result),
        });
      }
      continue;
    }

    if (args.scenario.termination.kind === "condition" && conditionMatches(args.scenario.termination.condition, {
      text: lastAssistant(last), value: parsed(lastAssistant(last)), calledTools,
    })) break;
    if (args.scenario.termination.kind === "turn_limit" && turns >= args.scenario.termination.max_turns) break;
    if (!nodeId) break;
    const node = args.scenario.turn_plan?.nodes.find((item) => item.id === nodeId);
    if (!node) throw new ScenarioFailure("scenario_branch_missing");
    const count = (visits.get(node.id) ?? 0) + 1;
    if (count > node.max_visits) throw new ScenarioFailure("turn_budget_exhausted");
    visits.set(node.id, count);
    const text = lastAssistant(last);
    const branch = node.branches.find((candidate) =>
      conditionMatches(candidate.condition, {
        text,
        value: parsed(text),
        calledTools,
      }),
    );
    if (!branch) throw new ScenarioFailure("scenario_branch_missing");
    messages.push(node.message);
    nodeId = branch.next_node_id;
  }

  if (!last) throw new ScenarioFailure("scenario_branch_missing");
  const finishedAt = new Date().toISOString();
  const extensions = {
    ...last.extensions,
    "caudals.evals/scenario": {
      turns,
      tool_calls: toolCalls,
      output_tokens: outputTokens,
      output_tokens_estimated: tokenUsageEstimated,
      final_state: state,
      fixture_revision_id: args.fixture?.revision_id ?? null,
    },
  };
  return observationSchema.parse(
    withContentHash({
      ...last,
      observation_id: randomUUID(),
      repetition: args.repetition,
      started_at: startedAt,
      finished_at: finishedAt,
      messages,
      tool_events: toolEvents,
      artifacts,
      extensions,
    }),
  );
}

export function toolFinalStatePasses(
  fixture: ToolFixture,
  state: unknown,
  events: Observation["tool_events"],
) {
  return conditionsPass(fixture.final_state_predicates, state, events);
}
