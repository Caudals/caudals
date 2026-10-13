/**
 * Server handlers for /api/evals/v1/billing/estimates and the platform-admin
 * price-book endpoints (launch spec v2 §6.16; package L-10). Role checks are
 * server-side; every POST takes an Idempotency-Key and replays its response.
 */
import "server-only";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { requireWorkspace } from "@/lib/evals/domain/identity";
import { authenticateCustomerToken } from "@/lib/evals/monitoring/tokens";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import type { PoolClient } from "pg";
import { billingUiEligible } from "./billing-ui";
import { billingEstimatesMode } from "./config";
import { engineBillingMode, workspaceEngineMode } from "./engine";
import { autoRechargeCover } from "./limits";
import { creditsToUcr } from "./units";
import { EstimateError, estimateEvaluationRun, estimateRequestSchema } from "./estimate";
import {
  PriceBookError, activatePriceBook, cancelPriceBook, createPriceBookDraft, getPriceBookAt, getPriceBookRevision, listPriceBookRevisions,
  revisionView, routePriceIssues, schedulePriceBook,
} from "./price-book";

const PRICE_BOOK_MESSAGES: Partial<Record<PriceBookError["code"], [number, string]>> = {
  PRICE_BOOK_NOT_FOUND: [404, "Price-book revision not found."],
  PRICE_BOOK_TRANSITION: [409, "That change is not allowed in the revision's current state."],
  PRICE_BOOK_IMMUTABLE: [409, "Scheduled and active revisions cannot be edited. Draft a new revision instead."],
  PRICE_BOOK_IN_EFFECT: [409, "This revision has already taken effect."],
  PRICE_BOOK_INCOMPLETE: [422, "A revision must price every platform meter and the local model."],
  SCHEDULE_CONFLICT: [409, "Another revision is scheduled at or after that time. Cancel it first, or choose a later date."],
  NOTICE_PERIOD_REQUIRED: [422, "This revision raises prices: it needs at least 30 days' notice before it takes effect."],
  ROUTE_UNPRICED: [422, "A model in use by a customer route would have no credit rate in this revision."],
  INPUT_INVALID: [422, "Check the rates: each must be at least 10 credits per 1M tokens, on a 5-credit step, and listed once."],
  SCOPE_DENIED: [403, "A platform administrator is required."],
  NOTICE_NOT_SENT: [409, "This revision raises prices and its notice did not go out 30 days before its date, so it cannot take effect. Cancel it and schedule it again with 30 days' notice."],
  NOTICE_TOO_LATE: [409, "The notice deadline (30 days before the date) has passed. Cancel the revision and schedule it at least 30 days after today."],
  NOTICE_NOT_REQUIRED: [409, "This revision raises no rate: decreases apply without notice."],
};

/** Maps billing errors to the API's error shape. */
export function billingApiError(error: unknown): never {
  if (error instanceof PriceBookError) {
    const [status, message] = PRICE_BOOK_MESSAGES[error.code] ?? [422, "The price-book change was rejected."];
    throw new EvalError(error.code, status, message);
  }
  if (error instanceof EstimateError) {
    if (error.code === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 404);
    if (error.code === "PRICE_BOOK_MISSING") throw new EvalError("SERVICE_UNAVAILABLE", 503, error.detail);
    throw new EvalError("INPUT_INVALID", 422, error.detail);
  }
  throw error;
}

function idempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "An Idempotency-Key header is required.");
  return key;
}

/* ------------------------------------------------------------ estimates --- */

const estimateBody = z.object({ orgId: z.uuid() }).passthrough();

/**
 * Signed-in editors (owner, editor, operator; platform admins with an audited
 * support check). With BILLING_ESTIMATES_ENABLED=operators, editors of a
 * workspace where the billing screens show (L-15: the run estimate dialog) are
 * served too. The answer adds the run gate (§6.7): whether credits are
 * enforced for the workspace and whether auto-recharge covers a shortfall.
 */
export async function estimateForMember(request: Request, identity: EvalIdentity, body: unknown) {
  const mode = billingEstimatesMode();
  if (mode === "off") throw new EvalError("SCOPE_DENIED", 404);
  const { orgId, ...rest } = estimateBody.parse(body);
  const input = estimateRequestSchema.parse(rest);
  await requireWorkspace(identity, orgId, "write");
  const membership = identity.workspaces.find(workspace => workspace.id === orgId)?.role;
  const scope = { orgId, actorId: identity.user.id };
  if (mode === "operators" && !identity.platformRole && membership !== "operator"
    && !(await withTenant(scope, db => billingUiEligible(db, orgId)))) throw new EvalError("SCOPE_DENIED", 404);
  const key = idempotencyKey(request);
  return withTenant(scope, db => idempotent(db, scope, "billing-estimates", key, input, async () => {
    const estimate = await estimateEvaluationRun(db, orgId, input);
    return { ...estimate, gate: await runGate(db, orgId, estimate) };
  })).catch(billingApiError);
}

/**
 * §6.7: a run can start when available credits cover the p90 estimate, or
 * auto-recharge covers the gap. `enforced` is false where credits are not
 * enforced (shadow mode) or for contract workspaces, which run on their
 * contract budget; admission (lib/billing/engine.ts admitRun) applies the same rule.
 */
async function runGate(db: PoolClient, orgId: string, estimate: Awaited<ReturnType<typeof estimateEvaluationRun>>) {
  const enforced = estimate.balance?.requiresCredits === true && (await workspaceEngineMode(db, engineBillingMode(), orgId)) === "enforce";
  const shortfallUcr = estimate.balance && !estimate.balance.coversP90 && estimate.balance.addCredits !== null
    ? BigInt(estimate.ucr.p90) - creditsToUcr(estimate.balance.availableCredits) : BigInt(0);
  const cover = shortfallUcr > BigInt(0) ? await autoRechargeCover(db, orgId, shortfallUcr) : null;
  return { enforced, autoRechargeCovers: cover?.covers ?? false, autoRechargePackCredits: cover?.packCredits ?? null, canStart: !enforced || shortfallUcr <= BigInt(0) || cover?.covers === true };
}

/** A CI token (scope runs:read) for its own workspace, once estimates are open to everyone. */
export async function estimateForToken(request: Request, body: unknown) {
  if (billingEstimatesMode() !== "all") throw new EvalError("SCOPE_DENIED", 404);
  const { orgId, ...rest } = estimateBody.parse(body);
  const input = estimateRequestSchema.parse(rest);
  await authenticateCustomerToken(orgId, request.headers.get("authorization"), "runs:read");
  const key = idempotencyKey(request);
  const scope = { orgId, actorId: "customer-api-token" };
  return withTenant(scope, db => idempotent(db, scope, "billing-estimates", key, input, () => estimateEvaluationRun(db, orgId, input)))
    .catch(billingApiError);
}

/* ----------------------------------------------------------- price book --- */

const adminBody = z.object({ orgId: z.uuid() }).passthrough();

/** Lists revisions with the one in effect and every route's guard status. Platform admins. */
export async function listRevisionsForAdmin(identity: EvalIdentity, orgId: string) {
  requirePlatformAdmin(identity);
  return withTenant({ orgId, actorId: identity.user.id }, async db => {
    const revisions = await listPriceBookRevisions(db);
    const effective = await getPriceBookAt(db);
    const routes = await routePriceIssues(db);
    // The inputs of a new draft (L-16): the latest ECB rate and the weekly provider-price check.
    const fx = (await db.query("SELECT per_eur::text AS per_eur, to_char(rate_date,'YYYY-MM-DD') AS rate_date, source FROM billing.fx_rate WHERE currency='USD' ORDER BY rate_date DESC LIMIT 1")).rows[0];
    const check = (await db.query("SELECT checked_at, revision_id, changed, unavailable, changes FROM billing.price_check ORDER BY checked_at DESC LIMIT 1")).rows[0];
    return {
      effectiveRevisionId: effective?.revision.id ?? null, revisions, routes,
      latestFx: fx ? { usdPerEur: String(fx.per_eur), date: String(fx.rate_date), source: String(fx.source) } : null,
      latestCheck: check ? { checkedAt: new Date(check.checked_at).toISOString(), revisionId: String(check.revision_id), changed: Number(check.changed),
        unavailable: Number(check.unavailable), changes: (check.changes ?? []) as unknown[] } : null,
    };
  }).catch(billingApiError);
}

export async function revisionForAdmin(identity: EvalIdentity, orgId: string, id: string) {
  requirePlatformAdmin(identity);
  return withTenant({ orgId, actorId: identity.user.id }, async db => {
    const book = await getPriceBookRevision(db, z.uuid().parse(id));
    if (!book) throw new PriceBookError("PRICE_BOOK_NOT_FOUND");
    return { ...revisionView(book), routeIssues: (await routePriceIssues(db, book.revision.id)).filter(route => route.issue) };
  }).catch(billingApiError);
}

/** POST …/revisions: a new draft from provider prices, FX and changes. Recent sign-in, audited. */
export async function createDraftForAdmin(request: Request, identity: EvalIdentity, body: unknown) {
  requireRecentAuthentication(identity);
  const { orgId, ...input } = adminBody.parse(body);
  const key = idempotencyKey(request);
  const scope = { orgId, actorId: identity.user.id };
  return withTenant(scope, db => idempotent(db, scope, "price-book-revisions", key, input, async () => {
    const book = await createPriceBookDraft(db, input);
    return book ? revisionView(book) : null;
  })).catch(billingApiError);
}

type Transition = "schedule" | "activate" | "cancel";
/** POST …/revisions/:id/{schedule,activate,cancel}. Recent sign-in, audited. */
export async function transitionForAdmin(request: Request, identity: EvalIdentity, id: string, action: Transition, body: unknown) {
  requireRecentAuthentication(identity);
  const parsed: { orgId: string; effectiveAt?: string } = action === "schedule"
    ? z.strictObject({ orgId: z.uuid(), effectiveAt: z.iso.datetime({ offset: true }) }).parse(body)
    : z.strictObject({ orgId: z.uuid() }).parse(body);
  const revisionId = z.uuid().parse(id);
  const key = idempotencyKey(request);
  const scope = { orgId: parsed.orgId, actorId: identity.user.id };
  return withTenant(scope, db => idempotent(db, scope, `price-book-${action}`, key, { revisionId, ...parsed }, async () => {
    const revision = action === "schedule" ? await schedulePriceBook(db, revisionId, new Date(parsed.effectiveAt!))
      : action === "activate" ? await activatePriceBook(db, revisionId) : await cancelPriceBook(db, revisionId);
    return revision;
  })).catch(billingApiError);
}
