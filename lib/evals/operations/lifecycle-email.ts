import "server-only";
import { withTenant } from "../repositories/db";
import { callUrl, emailAppUrl, unsubscribeLinks, workspaceLinks } from "@/lib/email/links";
import { renderEmail, type RenderedEmail } from "@/lib/email/templates";
import type { SendEmail } from "./notifications";

/**
 * Lifecycle email (launch L-07, spec v2 P-38): a short sequence that helps a
 * new self-serve owner reach a first report, run by the evals scheduler.
 *
 * - Steps: D0 welcome; D1 if no test set; D3 if no run; D7 if no report (a
 *   15-minute setup call); after the first report, share it or book a
 *   readout; D21 re-run after fixes; D30 win-back when inactive.
 * - Each step sends at most once: it is claimed in `evals.lifecycle_email`
 *   before the provider call, and the Resend idempotency key is stable across
 *   retries. A step whose goal is already met (the person converted) or whose
 *   window passed is recorded as skipped and never sends later.
 * - Days are calendar days in Europe/Madrid, and steps after D0 go out in
 *   working hours (Monday to Friday, 09:00–18:00 Madrid), so DST changes and
 *   weekends never shift a send into the night.
 * - At most one lifecycle email per person per 20 hours, and only to owners
 *   of live self-serve workspaces on the free or pay-as-you-go plan (a first
 *   purchase keeps them in the sequence: migration 109) who did not unsubscribe (non-essential
 *   mail, with an unsubscribe link and one-click headers). Separate from the
 *   newsletter (Caudals Ops) and outreach (Warmbly): no list is shared.
 *
 * Off unless LIFECYCLE_EMAILS_ENABLED=true. LIFECYCLE_EMAIL_STEPS chooses the
 * steps (default D0–D7; `all` for every step).
 */

export const LIFECYCLE_STEPS = ["d0_welcome", "d1_test_set", "d3_run", "d7_report", "first_report", "d21_rerun", "d30_winback"] as const;
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];
export const DEFAULT_LIFECYCLE_STEPS: LifecycleStep[] = ["d0_welcome", "d1_test_set", "d3_run", "d7_report"];

export function lifecycleConfig(env: Record<string, string | undefined> = process.env) {
  const enabled = env.LIFECYCLE_EMAILS_ENABLED === "true";
  const raw = env.LIFECYCLE_EMAIL_STEPS?.trim();
  let steps: LifecycleStep[] = DEFAULT_LIFECYCLE_STEPS;
  if (raw === "all") steps = [...LIFECYCLE_STEPS];
  else if (raw) {
    const listed = raw.split(",").map((item) => item.trim()).filter(Boolean);
    const unknown = listed.filter((item) => !LIFECYCLE_STEPS.includes(item as LifecycleStep));
    if (unknown.length) throw new Error("lifecycle_email_steps_invalid");
    steps = LIFECYCLE_STEPS.filter((step) => listed.includes(step));
  }
  return { enabled, steps: new Set<LifecycleStep>(steps) };
}

/* ------------------------------------------------------------- time --- */

const TZ = "Europe/Madrid";
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const WORK_START = 9;
const WORK_END = 18;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short",
});
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of an instant in Madrid. */
export function madridParts(at: Date): Parts {
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) out[part.type] = part.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour), minute: Number(out.minute), second: Number(out.second), weekday: WEEKDAYS[out.weekday],
  };
}

/** The instant of a Madrid wall-clock time (the later one in the autumn overlap; spring-gap times move forward). */
export function madridTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = madridParts(new Date(guess));
    const diff = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wall;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** The same Madrid wall-clock time `days` calendar days later (not `days` × 24 h). */
export function addMadridDays(at: Date, days: number): Date {
  const p = madridParts(at);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return madridTime(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), p.hour, p.minute, p.second);
}

/** `at` if it falls in Madrid working hours, else the start of the next working period. */
export function nextWorkingTime(at: Date): Date {
  const p = madridParts(at);
  const weekday = p.weekday <= 5;
  if (weekday && p.hour >= WORK_START && p.hour < WORK_END) return at;
  let offset = weekday && p.hour < WORK_START ? 0 : 1;
  for (;;) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + offset));
    const dow = ((day.getUTCDay() + 6) % 7) + 1;
    if (dow <= 5) return madridTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), WORK_START);
    offset++;
  }
}

/* -------------------------------------------------------- decisions --- */

export type Recorded = { status: "sending" | "retry" | "sent" | "failed" | "skipped"; attempts: number; updated_at: string };

export type LifecycleCandidate = {
  user_id: string;
  org_id: string;
  workspace_name: string;
  email: string;
  name: string | null;
  locale: string;
  signed_up_at: Date;
  has_test_set: boolean;
  has_run: boolean;
  has_report: boolean;
  first_report_at: Date | null;
  shared: boolean;
  runs_after_first_report: number;
  last_activity_at: Date;
  recorded: Partial<Record<LifecycleStep, Recorded>>;
  last_sent_at: Date | null;
};

export type Decision = { action: "send"; due: Date } | { action: "skip"; reason: string } | { action: "wait" } | { action: "done" };

const OFFSET_DAYS: Record<Exclude<LifecycleStep, "d0_welcome" | "first_report">, number> = { d1_test_set: 1, d3_run: 3, d7_report: 7, d21_rerun: 21, d30_winback: 30 };
// How long a step stays sendable after it is due; later it is skipped, never sent late.
const WINDOW_DAYS: Record<LifecycleStep, number> = { d0_welcome: 2, d1_test_set: 2, d3_run: 4, d7_report: 7, first_report: 7, d21_rerun: 7, d30_winback: 7 };
const STALE_CLAIM_MS = 15 * 60_000;
export const MIN_GAP_MS = 20 * HOUR;
const INACTIVE_MS = 14 * DAY;

/** When a step becomes due, or null while it cannot apply yet (no first report). */
export function stepDueAt(step: LifecycleStep, c: Pick<LifecycleCandidate, "signed_up_at" | "first_report_at">): Date | null {
  if (step === "d0_welcome") return new Date(c.signed_up_at.getTime() + 2 * 60_000);
  if (step === "first_report") return c.first_report_at ? nextWorkingTime(new Date(c.first_report_at.getTime() + HOUR)) : null;
  return nextWorkingTime(addMadridDays(c.signed_up_at, OFFSET_DAYS[step]));
}

/** What to do with one step now. Pure: the scheduler tests drive it with fixed clocks. */
export function decideStep(step: LifecycleStep, c: LifecycleCandidate, now: Date): Decision {
  const recorded = c.recorded[step];
  if (recorded) {
    if (recorded.status === "sent" || recorded.status === "failed" || recorded.status === "skipped") return { action: "done" };
    if (recorded.status === "sending" && now.getTime() - new Date(recorded.updated_at).getTime() < STALE_CLAIM_MS) return { action: "done" };
    if (recorded.attempts >= 3) return { action: "done" };
  }
  const due = stepDueAt(step, c);
  if (!due) {
    // No report yet. After the 45-day cohort the person drops out anyway.
    return { action: "wait" };
  }
  if (now < due) return { action: "wait" };
  if (now > addMadridDays(due, WINDOW_DAYS[step])) return { action: "skip", reason: "window_passed" };
  switch (step) {
    case "d1_test_set": if (c.has_test_set) return { action: "skip", reason: "converted" }; break;
    case "d3_run": if (c.has_run) return { action: "skip", reason: "converted" }; break;
    case "d7_report": if (c.has_report) return { action: "skip", reason: "converted" }; break;
    case "first_report": if (c.shared) return { action: "skip", reason: "converted" }; break;
    case "d21_rerun":
      if (!c.has_report) return { action: "skip", reason: "not_applicable" };
      if (c.runs_after_first_report > 0) return { action: "skip", reason: "converted" };
      break;
    case "d30_winback": if (now.getTime() - c.last_activity_at.getTime() < INACTIVE_MS) return { action: "skip", reason: "active" }; break;
  }
  return { action: "send", due };
}

/**
 * The plan for one person: steps to record as skipped, and at most one step
 * to send (the earliest due), unless a lifecycle email went out in the last
 * 20 hours.
 */
export type CandidatePlan = { skips: Array<{ step: LifecycleStep; reason: string }>; send: { step: LifecycleStep; due: Date } | null };

export function planCandidate(c: LifecycleCandidate, steps: Set<LifecycleStep>, now: Date): CandidatePlan {
  const skips: CandidatePlan["skips"] = [];
  const due: Array<{ step: LifecycleStep; due: Date }> = [];
  for (const step of LIFECYCLE_STEPS) {
    if (!steps.has(step)) continue;
    const decision = decideStep(step, c, now);
    if (decision.action === "skip") skips.push({ step, reason: decision.reason });
    else if (decision.action === "send") due.push({ step, due: decision.due });
  }
  due.sort((a, b) => a.due.getTime() - b.due.getTime());
  const recent = c.last_sent_at !== null && now.getTime() - c.last_sent_at.getTime() < MIN_GAP_MS;
  return { skips, send: recent ? null : due[0] ?? null };
}

/* ----------------------------------------------------------- render --- */

export function renderLifecycleEmail(step: LifecycleStep, c: LifecycleCandidate, token: string, env: Record<string, string | undefined> = process.env): RenderedEmail {
  const base = emailAppUrl(env);
  const links = workspaceLinks(base, c.org_id);
  const unsubscribe = unsubscribeLinks(token, base);
  const locale = c.locale === "es" ? "es" : "en";
  const call = callUrl(env);
  switch (step) {
    case "d0_welcome": return renderEmail("welcome", locale, { name: c.name, workspace: c.workspace_name, workspaceUrl: links.evaluations, unsubscribe });
    case "d1_test_set": return renderEmail("d1_test_set", locale, { workspaceUrl: links.evaluations, callUrl: call, unsubscribe });
    case "d3_run": return renderEmail("d3_run", locale, { workspaceUrl: links.evaluations, hasTestSet: c.has_test_set, unsubscribe });
    case "d7_report": return renderEmail("d7_report", locale, { workspaceUrl: links.evaluations, callUrl: call, unsubscribe });
    case "first_report": return renderEmail("first_report", locale, { reportsUrl: links.reports, callUrl: call, unsubscribe });
    case "d21_rerun": return renderEmail("d21_rerun", locale, { workspaceUrl: links.evaluations, unsubscribe });
    case "d30_winback": return renderEmail("d30_winback", locale, { workspace: c.workspace_name, workspaceUrl: links.evaluations, callUrl: call, unsubscribe });
  }
}

/* ------------------------------------------------------------- tick --- */

const errorCode = (error: unknown) => (error instanceof Error && /^[a-z_]{1,40}$/.test(error.message) ? error.message : "email_send_failed");

/**
 * One pass of the sequence. Platform-wide through SECURITY DEFINER functions
 * that only the scheduler role may execute. Sends happen outside any
 * transaction: the claim is committed first, the outcome recorded after.
 */
export async function tickLifecycleEmails(options: {
  actorId: string;
  send: SendEmail;
  now?: Date;
  env?: Record<string, string | undefined>;
  maxSends?: number;
}) {
  const env = options.env ?? process.env;
  const config = lifecycleConfig(env);
  const result = { enabled: config.enabled, candidates: 0, sent: 0, skipped: 0, failed: 0 };
  if (!config.enabled || config.steps.size === 0) return result;
  const now = options.now ?? new Date();
  const scope = { orgId: "", actorId: options.actorId };
  const candidates = await withTenant(scope, async (db) =>
    (await db.query<LifecycleCandidate>("SELECT * FROM evals.lifecycle_email_candidates($1)", [500])).rows);
  result.candidates = candidates.length;
  const maxSends = options.maxSends ?? 20;
  for (const candidate of candidates) {
    const plan = planCandidate(candidate, config.steps, now);
    for (const skip of plan.skips) {
      await withTenant(scope, (db) => db.query("SELECT evals.lifecycle_email_skip($1,$2,$3,$4)", [candidate.user_id, candidate.org_id, skip.step, skip.reason]));
      result.skipped++;
    }
    if (!plan.send || result.sent + result.failed >= maxSends) continue;
    const step = plan.send.step;
    const locale = candidate.locale === "es" ? "es" : "en";
    const claim = await withTenant(scope, async (db) =>
      (await db.query<{ attempt: number; unsubscribe_token: string }>("SELECT * FROM evals.lifecycle_email_claim($1,$2,$3,$4)", [candidate.user_id, candidate.org_id, step, locale])).rows[0]);
    if (!claim) continue;
    let sent = false, messageId: string | null = null, reason: string | null = null;
    try {
      const email = renderLifecycleEmail(step, candidate, claim.unsubscribe_token, env);
      const response = await options.send({
        to: candidate.email, subject: email.subject, text: email.text, html: email.html, headers: email.headers,
        idempotencyKey: `lifecycle-${candidate.user_id}-${step}`,
      });
      sent = true;
      messageId = response.id;
    } catch (error) {
      reason = errorCode(error);
    }
    await withTenant(scope, (db) => db.query("SELECT evals.lifecycle_email_finish($1,$2,$3,$4,$5)", [candidate.user_id, step, sent, messageId, reason]));
    if (sent) result.sent++; else result.failed++;
  }
  return result;
}
