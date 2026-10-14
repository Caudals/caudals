/**
 * The engine side of "Ask your report" (launch L-36): what the inference
 * worker does for a step that carries `reportQuestionId`, inside the
 * transactions it already runs (lock order: workflow → step → question).
 *
 *   claim()          questionClaimGate   a question past its deadline (or erased,
 *                                         or already settled) is closed before any
 *                                         reservation, hold or call: no charge
 *   success          settleQuestion       after settle() and the credit capture:
 *                                         validate the answer, store it, record the
 *                                         ledger outcome (captured)
 *   failure, crash   failQuestion         after the hold is released: failed,
 *                                         refunded (released)
 *
 * Exactly one ledger outcome per question: one step, one attempt (questions
 * are never retried), one hold key `attempt:<id>`, and the outcome is written
 * in the same transaction that captures or releases that hold. A settled
 * question never changes (database trigger).
 */
import type { PoolClient } from "pg";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { attemptHoldKey } from "../../billing/ledger";
import { ucrToCredits } from "../../billing/units";
import type { EngineBillingMode } from "../../billing/engine";
import { refsFromJson } from "./question-refs";
import { validateQuestionOutput, type QuestionStatus } from "./questions";

type Row = Record<string, unknown>;

async function lockQuestion(c: PoolClient, orgId: string, questionId: string): Promise<Row | null> {
  return (await c.query("SELECT * FROM evals.report_question WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, questionId])).rows[0] ?? null;
}

export interface QuestionLedger {
  mode: "off" | "shadow" | "enforce" | "contract" | "free";
  outcome: "captured" | "released" | "none";
  key: string | null;
  entryIds: string[];
  heldUcr: bigint | null;
  chargedUcr: bigint;
  priceBookRevisionId: string | null;
}

/**
 * What the credit ledger recorded for the question's one engine call: the
 * real hold (enforce), else the shadow entries (shadow week), else nothing
 * (credits off, a contract workspace in enforce mode, a free model).
 */
export async function questionLedger(c: PoolClient, processMode: EngineBillingMode, orgId: string, attemptId: string | null): Promise<QuestionLedger> {
  const none = (mode: QuestionLedger["mode"]): QuestionLedger => ({ mode, outcome: "none", key: attemptId ? attemptHoldKey(attemptId) : null, entryIds: [], heldUcr: null, chargedUcr: BigInt(0), priceBookRevisionId: null });
  if (!attemptId) return none(processMode === "off" ? "off" : processMode);
  const key = attemptHoldKey(attemptId);
  if (processMode !== "off") {
    const hold = (await c.query("SELECT state,amount_ucr,captured_ucr,price_book_revision_id FROM billing.credit_hold WHERE org_id=$1 AND hold_key=$2", [orgId, key])).rows[0];
    if (hold) {
      const entries = (await c.query("SELECT id FROM billing.ledger_entry WHERE org_id=$1 AND attempt_id=$2 ORDER BY account_version", [orgId, attemptId])).rows;
      return { mode: "enforce", outcome: hold.state === "captured" ? "captured" : "released", key, entryIds: entries.map((row) => row.id as string),
        heldUcr: BigInt(hold.amount_ucr), chargedUcr: BigInt(hold.captured_ucr), priceBookRevisionId: hold.price_book_revision_id ?? null };
    }
    const shadow = (await c.query("SELECT id,kind,amount_ucr,price_book_revision_id FROM billing.shadow_entry WHERE org_id=$1 AND entry_key=$2 ORDER BY created_at,id", [orgId, key])).rows;
    const held = shadow.find((row) => row.kind === "hold"), captured = shadow.find((row) => row.kind === "capture");
    if (held) return { mode: "shadow", outcome: captured ? "captured" : "released", key, entryIds: shadow.map((row) => row.id as string),
      heldUcr: BigInt(held.amount_ucr), chargedUcr: captured ? BigInt(captured.amount_ucr) : BigInt(0), priceBookRevisionId: held.price_book_revision_id ?? null };
    // Enforce mode without a hold: a contract workspace or a free model.
    const account = (await c.query("SELECT billing_mode FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
    return none(account?.billing_mode === "contract" ? "contract" : processMode === "enforce" ? "free" : processMode);
  }
  return none("off");
}

async function emit(c: PoolClient, orgId: string, questionId: string, status: QuestionStatus, ledger: QuestionLedger) {
  // Credits actually charged (enforce mode); 0 otherwise. Analytics can never fail the settlement.
  const credits = ledger.mode === "enforce" && ledger.outcome === "captured" ? Number(ucrToCredits(ledger.chargedUcr)) : 0;
  await recordProductEvent({ eventName: "report_question_asked", source: "server", orgId, eventKey: questionId, payload: { outcome: status, credits } }, c);
}

async function finish(c: PoolClient, orgId: string, question: Row, update: {
  status: QuestionStatus; reason: string | null; answer?: unknown; citedResultIds?: string[]; citedFindingIds?: string[];
  attemptId: string | null; usage?: { input: number; output: number; provenance: "provider_reported" | "bounded_estimate" } | null; ledger: QuestionLedger;
}) {
  const erased = question.deleted_at !== null;
  await c.query(`UPDATE evals.report_question SET status=$3,reason_code=$4,answer=$5,cited_result_ids=$6,cited_finding_ids=$7,attempt_id=$8,
      input_tokens=$9,output_tokens=$10,token_provenance=$11,ledger_mode=$12,ledger_outcome=$13,ledger_key=$14,ledger_entry_ids=$15,
      price_book_revision_id=$16,held_ucr=$17,charged_ucr=$18,finished_at=now()
    WHERE org_id=$1 AND id=$2`, [orgId, question.id, update.status, update.reason,
    erased || update.answer === undefined ? null : JSON.stringify(update.answer), update.citedResultIds ?? [], update.citedFindingIds ?? [], update.attemptId,
    update.usage?.input ?? null, update.usage?.output ?? null, update.usage?.provenance ?? null, update.ledger.mode, update.ledger.outcome, update.ledger.key,
    update.ledger.entryIds, update.ledger.priceBookRevisionId, update.ledger.heldUcr?.toString() ?? null,
    update.ledger.outcome === "captured" ? update.ledger.chargedUcr.toString() : "0"]);
  await emit(c, orgId, question.id as string, update.status, update.ledger);
}

/**
 * Before a reservation: a question that is no longer waiting (erased, settled)
 * or is past its deadline is closed here and its step is not called. Returns
 * whether the call may go ahead.
 */
export async function questionClaimGate(c: PoolClient, processMode: EngineBillingMode, orgId: string, questionId: string): Promise<boolean> {
  const question = await lockQuestion(c, orgId, questionId);
  if (!question || question.status !== "queued") return false;
  if (question.deleted_at !== null) {
    await finish(c, orgId, question, { status: "failed", reason: "question_deleted", attemptId: null, ledger: await questionLedger(c, processMode, orgId, null) });
    return false;
  }
  if (new Date(question.deadline_at as string).getTime() <= Date.now()) {
    await finish(c, orgId, question, { status: "timed_out", reason: "queue_deadline", attemptId: null, ledger: await questionLedger(c, processMode, orgId, null) });
    return false;
  }
  return true;
}

/** A completed call (after its capture, or its release when the answer was incomplete): validate and store the answer. */
export async function settleQuestion(c: PoolClient, processMode: EngineBillingMode, input: {
  orgId: string; questionId: string; attemptId: string; output: { text: string; complete: boolean };
  usage: { input: number; output: number; provenance: "provider_reported" | "bounded_estimate" };
}): Promise<QuestionStatus | null> {
  const question = await lockQuestion(c, input.orgId, input.questionId);
  if (!question || question.status !== "queued") return null;
  const verdict = validateQuestionOutput(input.output, refsFromJson(question.refs));
  const ledger = await questionLedger(c, processMode, input.orgId, input.attemptId);
  await finish(c, input.orgId, question, {
    status: verdict.status, reason: verdict.reason, answer: verdict.answer ?? undefined,
    citedResultIds: verdict.citedResultIds, citedFindingIds: verdict.citedFindingIds,
    attemptId: input.attemptId, usage: input.usage, ledger,
  });
  if (verdict.status !== "answered") console.info(JSON.stringify({ event: "report_question_not_answered", reason: verdict.reason, refs: verdict.refsTotal, valid: verdict.refsValid }));
  return verdict.status;
}

/** A failed, timed-out or interrupted call, after its hold was released: the question failed and nothing is charged. */
export async function failQuestion(c: PoolClient, processMode: EngineBillingMode, input: { orgId: string; questionId: string; attemptId: string | null; reason: string }): Promise<void> {
  const question = await lockQuestion(c, input.orgId, input.questionId);
  if (!question || question.status !== "queued") return;
  const reason = /^[a-z][a-z0-9_]{1,63}$/.test(input.reason) ? input.reason : "invocation_failed";
  await finish(c, input.orgId, question, { status: "failed", reason, attemptId: input.attemptId, ledger: await questionLedger(c, processMode, input.orgId, input.attemptId) });
}
