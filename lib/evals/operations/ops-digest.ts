/**
 * Weekly ops digest (launch L-21, spec v2 P-36): every Monday at 08:00
 * Europe/Madrid (DST-safe) the scheduler emails the founders last week's
 * funnel against the §7.11 targets and today's to-dos: stuck runs, failed
 * demos by reason, credit holds older than 24 hours, low-balance accounts and
 * new sign-ups to call. It goes only to the internal address in
 * COLLABORATION_NOTIFICATION_EMAIL; one send per week (claimed in the
 * database, Resend idempotency key per week).
 */
import { withTenant } from "../repositories/db";
import { GROWTH_TARGETS, ratio, targetStage, type GrowthTargets, type OpsDigestData, type TargetStage } from "../../analytics/targets";

export const DIGEST_TIME_ZONE = "Europe/Madrid";
export const DIGEST_HOUR = 8;

export function opsDigestEnabled(env: Record<string, string | undefined> = process.env) {
  return env.OPS_DIGEST_ENABLED === "true";
}

type Parts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of an instant in Madrid. */
export function madridParts(at: Date): Parts {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: DIGEST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: WEEKDAYS[parts.weekday], hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** The UTC instant of a Madrid wall-clock time (midnight and 08:00 never fall in a DST gap there). */
export function madridInstant(year: number, month: number, day: number, hour = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  const offsetAt = (instant: number) => {
    const p = madridParts(new Date(instant));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * The digest week for an instant: its key is the Madrid Monday of the current
 * week, it covers the seven Madrid days before that Monday, and it is due from
 * Monday 08:00 Madrid until the end of that Monday.
 */
export function digestWeek(now: Date) {
  const p = madridParts(now);
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - (p.weekday - 1)));
  const previous = new Date(monday.getTime() - 7 * 86_400_000);
  const weekStart = iso(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  const to = madridInstant(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  const from = madridInstant(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate());
  const sendAt = madridInstant(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), DIGEST_HOUR);
  return { weekStart, from, to, sendAt, due: p.weekday === 1 && p.hour >= DIGEST_HOUR };
}

/* ------------------------------------------------------------- content --- */

type Locale = "en" | "es";
const COPY = {
  en: {
    subject: (range: string) => `Caudals weekly digest · ${range}`,
    title: (range: string) => `Caudals weekly digest · ${range}`,
    targets: (stage: string) => `Targets: ${stage} (spec §7.11).`,
    stages: { gate_a: "at Gate A", gate_b: "at Gate B", launch_4w: "4 weeks after launch", launch_12w: "12 weeks after launch" } as Record<TargetStage, string>,
    funnel: "LAST WEEK AGAINST TARGET",
    sessions: "Site sessions (consented)",
    demoStarts: "Demo starts",
    demoSuccess: "Demo success",
    demoP50: "Demo p50 duration",
    accounts: "New accounts",
    activation: "Activation (own report within 7 days)",
    snapshots: "Evidence snapshots shared",
    made: "made",
    paying: "Paying customers",
    noPurchases: "no purchases recorded yet",
    runs: "Runs started",
    reports: "Report views",
    todo: "TO DO TODAY",
    stuck: "Stuck runs (no progress for 2 hours)",
    failedDemos: "Failed demos last week, by reason",
    holds: "Credit holds older than 24 hours",
    lowBalance: "Low-balance accounts (under 500 credits)",
    signups: "New sign-ups to call",
    none: "none",
    of: "of",
    since: "since",
    queue: (n: number) => `Demo queue now: ${n}.`,
    growth: "Pipeline and cohorts",
    footer: "Internal: sent only to the Caudals collaboration address. Aggregates, workspace names and email domains only.",
    stagesNames: { account_created: "account created", evaluation_created: "evaluation created", test_set_ready: "test set ready", run_started: "run started", run_finished: "run finished", report_viewed: "report viewed" } as Record<string, string>,
  },
  es: {
    subject: (range: string) => `Resumen semanal de Caudals · ${range}`,
    title: (range: string) => `Resumen semanal de Caudals · ${range}`,
    targets: (stage: string) => `Objetivos: ${stage} (spec §7.11).`,
    stages: { gate_a: "en la Puerta A", gate_b: "en la Puerta B", launch_4w: "4 semanas tras el lanzamiento", launch_12w: "12 semanas tras el lanzamiento" } as Record<TargetStage, string>,
    funnel: "LA SEMANA PASADA FRENTE AL OBJETIVO",
    sessions: "Sesiones en la web (con consentimiento)",
    demoStarts: "Demos iniciadas",
    demoSuccess: "Demos con éxito",
    demoP50: "Duración p50 de la demo",
    accounts: "Cuentas nuevas",
    activation: "Activación (informe propio en 7 días)",
    snapshots: "Pruebas externas compartidas",
    made: "hechas",
    paying: "Clientes de pago",
    noPurchases: "aún no hay compras registradas",
    runs: "Ejecuciones iniciadas",
    reports: "Vistas de informes",
    todo: "PENDIENTE HOY",
    stuck: "Ejecuciones atascadas (sin avance en 2 horas)",
    failedDemos: "Demos fallidas la semana pasada, por motivo",
    holds: "Reservas de créditos de más de 24 horas",
    lowBalance: "Cuentas con saldo bajo (menos de 500 créditos)",
    signups: "Altas nuevas a las que llamar",
    none: "ninguna",
    of: "de",
    since: "desde",
    queue: (n: number) => `Cola de la demo ahora: ${n}.`,
    growth: "Embudo y cohortes",
    footer: "Interno: se envía solo a la dirección de colaboración de Caudals. Solo agregados, nombres de espacios y dominios de correo.",
    stagesNames: { account_created: "cuenta creada", evaluation_created: "evaluación creada", test_set_ready: "pruebas listas", run_started: "ejecución iniciada", run_finished: "ejecución terminada", report_viewed: "informe visto" } as Record<string, string>,
  },
} as const;

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`);
const duration = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  return total >= 60 ? `${Math.floor(total / 60)} min ${total % 60} s` : `${total} s`;
};

function formatDay(value: string | Date, locale: Locale, withTime = false) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    timeZone: DIGEST_TIME_ZONE, day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

/** The digest's subject and plain-text body. Numbers come only from the aggregates. */
export function composeDigest(data: OpsDigestData, options: { locale?: Locale; stage?: TargetStage; appUrl?: string } = {}) {
  const locale = options.locale ?? "en";
  const copy = COPY[locale];
  const stage = options.stage ?? "gate_a";
  const targets: GrowthTargets = GROWTH_TARGETS[stage];
  const app = (options.appUrl ?? "https://app.caudals.com").replace(/\/$/, "");
  const f = data.funnel;
  const lastDay = new Date(new Date(data.to).getTime() - 1);
  const range = `${formatDay(data.from, locale)} – ${formatDay(lastDay, locale)}`;
  const success = ratio(f.demo_succeeded, f.demo_finished);
  const activation = ratio(f.activation_activated, f.activation_cohort);
  const line = (label: string, actual: string, target: string) => `- ${label}: ${actual} / ${target}`;
  const lines: string[] = [
    copy.title(range),
    copy.targets(copy.stages[stage]),
    "",
    copy.funnel,
    line(copy.sessions, String(f.sessions), String(targets.sessions)),
    line(copy.demoStarts, String(f.demo_starts), String(targets.demoStarts)),
    line(copy.demoSuccess, `${percent(success)} (${f.demo_succeeded} ${copy.of} ${f.demo_finished})`, `≥ ${percent(targets.demoSuccess)}`),
    line(copy.demoP50, duration(f.demo_p50_s), `≤ ${duration(targets.demoP50Seconds)}`),
    line(copy.accounts, String(f.new_accounts), String(targets.newAccounts)),
    line(copy.activation, `${percent(activation)} (${f.activation_activated} ${copy.of} ${f.activation_cohort})`, percent(targets.activation)),
    line(copy.snapshots, `${f.snapshots_shared} (${copy.made}: ${f.snapshots_created})`, String(targets.snapshotsShared)),
    line(copy.paying, f.purchases_recorded ? String(f.paying_customers) : `— (${copy.noPurchases})`, String(targets.payingCustomers)),
    `- ${copy.runs}: ${f.runs_started} · ${copy.reports}: ${f.reports_viewed}`,
    "",
    copy.todo,
    `${copy.stuck} (${data.stuck_run_count}):`,
    ...(data.stuck_runs.length
      ? data.stuck_runs.map((run) => `- ${run.workspace} · ${run.status}/${run.phase} · ${copy.since} ${formatDay(run.since, locale, true)} · ${app}/ops/runs/${run.runId}?orgId=${run.orgId}`)
      : [`- ${copy.none}`]),
    `${copy.failedDemos}:`,
    data.demo_failures.length ? `- ${data.demo_failures.map((item) => `${item.reason} ${item.count}`).join(", ")}` : `- ${copy.none}`,
    copy.queue(data.demo_queue),
    `${copy.holds}:`,
    ...(data.old_holds.length
      ? data.old_holds.map((hold) => `- ${hold.workspace} · ${hold.holds} · ${hold.credits} cr · ${copy.since} ${formatDay(hold.since, locale, true)}`)
      : [`- ${copy.none}`]),
    `${copy.lowBalance}:`,
    ...(data.low_balance.length ? data.low_balance.map((row) => `- ${row.workspace} · ${row.credits} cr`) : [`- ${copy.none}`]),
    `${copy.signups} (${data.signups.length}):`,
    ...(data.signups.length
      ? data.signups.map((row) => `- ${row.company} · ${row.domain ?? "—"} · ${row.source} · ${copy.stagesNames[row.stage] ?? row.stage} · ${formatDay(row.createdAt, locale)}`)
      : [`- ${copy.none}`]),
    "",
    `${copy.growth}: ${app}/ops/growth`,
    "",
    copy.footer,
  ];
  return { subject: copy.subject(range), text: lines.join("\n") };
}

/** Counts kept with the send record: aggregates only. */
export function digestSummary(data: OpsDigestData) {
  const f = data.funnel;
  return {
    sessions: f.sessions, demo_starts: f.demo_starts, demo_finished: f.demo_finished, demo_succeeded: f.demo_succeeded, new_accounts: f.new_accounts,
    snapshots_shared: f.snapshots_shared, stuck_runs: data.stuck_run_count, old_holds: data.old_holds.length, low_balance: data.low_balance.length, signups: data.signups.length,
  };
}

/* ---------------------------------------------------------------- send --- */

export type DigestSend = (message: { to: string; subject: string; text: string; idempotencyKey: string }) => Promise<{ id: string | null }>;

export async function digestSender(): Promise<DigestSend> {
  const { getResendClient } = await import("@/lib/resend/client");
  const { getSecretEnvValue } = await import("@/lib/env/secrets");
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured");
  const client = getResendClient();
  return async (message) => {
    const result = await client.emails.send({ from, to: message.to, subject: message.subject, text: message.text }, { idempotencyKey: message.idempotencyKey });
    if (result.error) throw new Error("email_provider_rejected");
    return { id: result.data?.id ?? null };
  };
}

/** The internal recipient; never logged. */
export async function digestRecipient() {
  const { getSecretEnvValue } = await import("@/lib/env/secrets");
  const to = getSecretEnvValue("COLLABORATION_NOTIFICATION_EMAIL");
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("digest_recipient_missing");
  return to;
}

export type DigestOutcome = { status: "not_due" | "already_claimed" | "sent" | "failed"; week: string; reason?: string; summary?: ReturnType<typeof digestSummary> };

/**
 * Sends the week's digest once. `force` sends outside the Monday window (a
 * manual check); it still claims the week, so it never sends twice.
 */
export async function runOpsDigest(options: { actorId: string; send: DigestSend; to: string; now?: Date; force?: boolean; locale?: Locale; appUrl?: string }): Promise<DigestOutcome> {
  const now = options.now ?? new Date();
  const week = digestWeek(now);
  if (!week.due && !options.force) return { status: "not_due", week: week.weekStart };
  const scope = { orgId: "", actorId: options.actorId };
  const claimed = await withTenant(scope, async (db) => (await db.query("SELECT evals.claim_ops_digest($1::date) AS ok", [week.weekStart])).rows[0]?.ok === true);
  if (!claimed) return { status: "already_claimed", week: week.weekStart };
  let reason = "digest_failed";
  try {
    const data = await withTenant(scope, async (db) => {
      await db.query("SET LOCAL statement_timeout='5000ms'");
      return (await db.query("SELECT evals.ops_digest_data($1,$2) AS data", [week.from, week.to])).rows[0].data as OpsDigestData;
    });
    const message = composeDigest(data, { locale: options.locale, stage: targetStage(), appUrl: options.appUrl });
    reason = "email_failed";
    const result = await options.send({ to: options.to, subject: message.subject, text: message.text, idempotencyKey: `ops-digest-${week.weekStart}` });
    const summary = digestSummary(data);
    await withTenant(scope, (db) => db.query("SELECT evals.finish_ops_digest($1::date,true,$2,NULL,$3)", [week.weekStart, result.id, summary]));
    return { status: "sent", week: week.weekStart, summary };
  } catch {
    await withTenant(scope, (db) => db.query("SELECT evals.finish_ops_digest($1::date,false,NULL,$2,'{}'::jsonb)", [week.weekStart, reason])).catch(() => undefined);
    return { status: "failed", week: week.weekStart, reason };
  }
}

export function digestLocale(env: Record<string, string | undefined> = process.env): Locale {
  return env.OPS_DIGEST_LOCALE === "es" ? "es" : "en";
}
