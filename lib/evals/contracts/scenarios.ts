import { z } from "zod";
import { artifactSchema, capabilitySchema, idSchema, jsonValueSchema, messageSchema, selectorSchema } from "./primitives";

export const conditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("always") }),
  z.strictObject({ kind: z.literal("text_contains"), value: z.string().min(1).max(10000) }),
  z.strictObject({ kind: z.literal("json_equals"), path: selectorSchema, value: jsonValueSchema }),
  z.strictObject({ kind: z.literal("tool_called"), tool_name: idSchema }),
]);
export const turnPlanSchema = z.strictObject({
  entry_node_id: idSchema,
  nodes: z.array(z.strictObject({ id: idSchema, message: messageSchema, max_visits: z.int().min(1).max(100), branches: z.array(z.strictObject({ condition: conditionSchema, next_node_id: idSchema.nullable() })).min(1).max(32) })).min(1).max(100),
}).superRefine((plan, ctx) => {
  const ids = new Set(plan.nodes.map((node) => node.id));
  if (ids.size !== plan.nodes.length || !ids.has(plan.entry_node_id)) ctx.addIssue({ code: "custom", message: "Duplicate nodes or missing entry node" });
  for (const node of plan.nodes) {
    if (node.message.role !== "user") ctx.addIssue({ code: "custom", message: "Scripted turns must be user messages" });
    for (const branch of node.branches) if (branch.next_node_id !== null && !ids.has(branch.next_node_id)) ctx.addIssue({ code: "custom", message: "Dangling turn branch" });
  }
  const reachable = new Set<string>();
  const visit = (id: string) => { if (reachable.has(id)) return; reachable.add(id); for (const branch of plan.nodes.find((n) => n.id === id)?.branches ?? []) if (branch.next_node_id !== null) visit(branch.next_node_id); };
  visit(plan.entry_node_id);
  if (reachable.size !== ids.size) ctx.addIssue({ code: "custom", message: "Unreachable turn node" });
});
export const terminationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("final_answer") }),
  z.strictObject({ kind: z.literal("turn_limit"), max_turns: z.int().positive().max(1000) }),
  z.strictObject({ kind: z.literal("condition"), condition: conditionSchema }),
]);
const base = { required_capabilities: z.array(capabilitySchema).min(1), messages: z.array(messageSchema).min(1).max(1000), attachments: z.array(artifactSchema), termination: terminationSchema };
export const scenarioSchema = z.discriminatedUnion("mode", [
  z.strictObject({ ...base, mode: z.literal("single_turn"), turn_plan: z.null(), tool_fixture_set_id: z.null() }),
  z.strictObject({ ...base, mode: z.literal("next_reply"), turn_plan: z.null(), tool_fixture_set_id: z.null() }),
  z.strictObject({ ...base, mode: z.literal("conversation"), turn_plan: turnPlanSchema, tool_fixture_set_id: idSchema.nullable() }),
  z.strictObject({ ...base, mode: z.literal("tool_workflow"), turn_plan: turnPlanSchema.nullable(), tool_fixture_set_id: idSchema }),
]);
// JSON Schema is data, never executable code. Schema resolution/network fetching is not authorized here.
export const jsonSchemaDocumentSchema = z.record(z.string(), jsonValueSchema);
export const toolDefinitionSchema = z.strictObject({ name: idSchema, description: z.string().min(1), input_schema: jsonSchemaDocumentSchema, output_schema: jsonSchemaDocumentSchema });
export const toolFixtureSchema = z.strictObject({
  schema_version: z.literal("1.0"), fixture_set_id: idSchema, revision_id: idSchema, content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  seed: z.int().nonnegative(), tools: z.array(toolDefinitionSchema).min(1), initial_state: jsonValueSchema,
  transitions: z.array(z.strictObject({ tool_name: idSchema, when: conditionSchema, result: jsonValueSchema, next_state: jsonValueSchema })).min(1),
  final_state_predicates: z.array(conditionSchema).min(1), reset: z.literal("restore_initial_state"), side_effects: z.literal("simulated_only"),
}).superRefine((fixture, ctx) => {
  const names = new Set(fixture.tools.map((tool) => tool.name));
  if (names.size !== fixture.tools.length || fixture.transitions.some((t) => !names.has(t.tool_name))) ctx.addIssue({ code: "custom", message: "Duplicate or unknown fixture tool" });
});
