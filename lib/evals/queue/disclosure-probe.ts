import type { PoolClient } from "pg";
import type { TargetConfig } from "../contracts/connectors";
import { withContentHash } from "../contracts/hashing";
import type { CandidateInput } from "../contracts/projections";
import { observationSchema, type Observation } from "../contracts/results";
import {
  AI_DISCLOSURE_EXTENSION,
  disclosureLanguage,
  disclosureTurn,
  finalizeDisclosure,
  OPENING_MESSAGE,
  PERSON_QUESTION,
  type DisclosureResult,
  type DisclosureTurn,
} from "../scoring/disclosure";

/**
 * The AI-disclosure check in a product run (launch L-29, spec P-08). One per
 * run, on its first case unit, after that case's own answer is captured and
 * inside the same fenced attempt, so every extra target call goes through the
 * call ledger, its rate limit and the attempt's credential, and costs no
 * credits (questions are metered per case unit). The case's observation and
 * its grade are unchanged; the result rides on the observation as an
 * extension and reaches the report from there. It never counts toward a score.
 *
 * - API targets: our opening, then the one ordinary question, each in a fresh
 *   conversation (as in the demo).
 * - Websites: the chat's greeting (recorded on the first turn), the case's
 *   question and first reply, then the question as a follow-up in the same chat.
 *
 * Product runs have no judge for this check (engine calls must go through the
 * reservation path), so an ambiguous transcript stays Unclear.
 */

export const DISCLOSURE_TARGET_KINDS: ReadonlySet<TargetConfig["kind"]> = new Set(["openai_compatible", "https_json", "website"]);

/** The run's first case unit (stable order) takes the check. */
export async function isDisclosureUnit(c: PoolClient, orgId: string, runId: string, caseUnitId: string) {
  const first = (await c.query<{ id: string }>("SELECT id FROM evals.case_unit WHERE org_id=$1 AND run_id=$2 ORDER BY created_at,id LIMIT 1", [orgId, runId])).rows[0];
  return first?.id === caseUnitId;
}

const lastAssistant = (observation: Observation) => [...observation.messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
const errorCode = (error: unknown) => (error instanceof Error && /^[a-z0-9_]{1,64}$/.test(error.message) ? error.message : "capture_failed");

/** Asks and records; a failed call is part of the transcript, never a failure of the case. */
async function ask(invoke: (input: CandidateInput) => Promise<Observation>, input: CandidateInput) {
  try {
    const observation = await invoke(input);
    const text = observation.status === "succeeded" ? lastAssistant(observation).trim() : "";
    return { text, error: observation.status !== "succeeded" ? observation.error?.code ?? "capture_failed" : text ? null : "no_reply" };
  } catch (error) {
    return { text: "", error: errorCode(error) };
  }
}

export async function runDisclosureProbe(args: {
  kind: TargetConfig["kind"];
  answered: Observation;
  candidate: CandidateInput;
  invoke: (input: CandidateInput) => Promise<Observation>;
  now?: () => Date;
}): Promise<DisclosureResult> {
  const { answered, candidate } = args;
  const users = answered.messages.filter((message) => message.role === "user").map((message) => message.content);
  const replies = answered.messages.filter((message) => message.role === "assistant").map((message) => message.content);
  const language = disclosureLanguage([...users, ...replies]);
  const question = PERSON_QUESTION[language];
  const fresh = (content: string): CandidateInput => ({ ...candidate, messages: [{ role: "user", content }], attachments: [], tools: [] });
  const turns: DisclosureTurn[] = [];
  if (args.kind === "website") {
    const browser = answered.extensions["caudals.evals/browser"] as { greeting?: unknown } | undefined;
    if (typeof browser?.greeting === "string" && browser.greeting.trim()) turns.push(disclosureTurn("greeting", browser.greeting));
    turns.push(disclosureTurn("opening", users[0] ?? ""), disclosureTurn("first_reply", replies[0] ?? "", replies[0]?.trim() ? null : "no_reply"));
    const person = await ask(args.invoke, { ...candidate, messages: [...answered.messages, { role: "user", content: question }] });
    turns.push(disclosureTurn("person_question", question), disclosureTurn("person_answer", person.text, person.error));
  } else {
    const first = await ask(args.invoke, fresh(OPENING_MESSAGE[language]));
    const person = await ask(args.invoke, fresh(question));
    turns.push(
      disclosureTurn("opening", OPENING_MESSAGE[language]),
      disclosureTurn("first_reply", first.text, first.error),
      disclosureTurn("person_question", question),
      disclosureTurn("person_answer", person.text, person.error),
    );
  }
  return finalizeDisclosure({ transcript: turns, language, checkedAt: args.now?.() });
}

/** The case's observation with the check attached (and its content hash recomputed). */
export function withDisclosure(observation: Observation, result: DisclosureResult): Observation {
  return observationSchema.parse(withContentHash({ ...observation, extensions: { ...observation.extensions, [AI_DISCLOSURE_EXTENSION]: result } }));
}

/** Runs the check and attaches it; anything unexpected leaves the case's observation as it was. */
export async function attachDisclosureProbe(args: Parameters<typeof runDisclosureProbe>[0]): Promise<Observation> {
  try {
    return withDisclosure(args.answered, await runDisclosureProbe(args));
  } catch (error) {
    console.warn(JSON.stringify({ event: "ai_disclosure_probe_failed", code: errorCode(error) }));
    return args.answered;
  }
}
