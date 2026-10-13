import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import { maxActive, maxActiveWebsite } from "./config";
import { DEFAULT_DURATIONS, nextAdmissible, type Durations, type Slots } from "./eta";
import { normalizeRun, STARTED, WAITING, type RunRow } from "./store";
export { queueEta, runEta, type Durations } from "./eta";

/**
 * The demo queue (DEMO_QUEUE_ENABLED). Runs wait in FIFO order of queued_at
 * and are admitted while fewer than DEMO_MAX_ACTIVE are in progress and a
 * model can serve them. Website runs also need a free browser slot
 * (DEMO_MAX_ACTIVE_WEBSITE); an API run behind a website run that waits for
 * the browser may go first, so one busy resource never blocks the other.
 * Admission takes a transaction advisory lock, so two app processes (a
 * rolling deploy) cannot admit more than the limits allow.
 */

/**
 * Admits waiting runs while slots allow. Returns the admitted rows, with
 * `first` set when the run left the queue for the first time (a run that
 * went back to the queue mid-way has already started once).
 */
export async function admitWaiting(options: { limit?: number } = {}): Promise<Array<RunRow & { first: boolean }>> {
  const client = await getPostgresPool().connect();
  const admitted: Array<RunRow & { first: boolean }> = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('caudals-demo-queue'))");
    const { rows: counts } = await client.query<{ active: string; website: string }>(
      `SELECT count(*) AS active, count(*) FILTER (WHERE target_kind = 'website') AS website
       FROM demo.run WHERE phase NOT IN ('done','failed') AND ${STARTED} AND expires_at > now()`,
    );
    const slots: Slots = { active: +counts[0].active, website: +counts[0].website, maxActive: maxActive(), maxWebsite: maxActiveWebsite() };
    const { rows: waiting } = await client.query<{ id: string; target_kind: string; phase: string }>(
      `SELECT id, target_kind, phase FROM demo.run
       WHERE ${WAITING} AND phase NOT IN ('done','failed') AND expires_at > now()
       ORDER BY queued_at, id LIMIT 50`,
    );
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    while (admitted.length < limit) {
      const next = nextAdmissible(waiting, slots);
      if (!next) break;
      waiting.splice(waiting.indexOf(next), 1);
      const { rows } = await client.query<RunRow>(
        `UPDATE demo.run SET started_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 AND ${WAITING} AND phase NOT IN ('done','failed') RETURNING *`,
        [next.id],
      );
      if (!rows[0]) continue;
      slots.active++;
      if (next.target_kind === "website") slots.website++;
      // Only model work sends a run back to the queue, never reading, so a
      // run still reading leaves the queue for the first time.
      admitted.push({ ...normalizeRun(rows[0]), first: next.phase === "reading" });
    }
    await client.query("COMMIT");
    return admitted;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Whether any run waits; a cheap check before admission. */
export async function hasWaiting() {
  const { rows } = await getPostgresPool().query<{ waiting: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM demo.run WHERE ${WAITING} AND phase NOT IN ('done','failed') AND expires_at > now()) AS waiting`,
  );
  return rows[0]?.waiting === true;
}

/** The run's place in line (1 = next), or null when it is not waiting. */
export async function queuePosition(id: string): Promise<number | null> {
  const { rows } = await getPostgresPool().query<{ position: string | null }>(
    `SELECT CASE WHEN me.started_at IS NULL AND me.queued_at IS NOT NULL AND me.phase NOT IN ('done','failed') THEN
       (SELECT count(*) + 1 FROM demo.run q
         WHERE q.started_at IS NULL AND q.queued_at IS NOT NULL AND q.phase NOT IN ('done','failed') AND q.expires_at > now()
           AND (q.queued_at, q.id) < (me.queued_at, me.id))
     END AS position
     FROM demo.run me WHERE me.id = $1`,
    [id],
  );
  return rows[0]?.position ? Number(rows[0].position) : null;
}

export type QueueState = { waiting: number; active: number };

export async function queueState(): Promise<QueueState> {
  const { rows } = await getPostgresPool().query<{ waiting: string; active: string }>(
    `SELECT count(*) FILTER (WHERE ${WAITING}) AS waiting, count(*) FILTER (WHERE ${STARTED}) AS active
     FROM demo.run WHERE phase NOT IN ('done','failed') AND expires_at > now()`,
  );
  return { waiting: +rows[0].waiting, active: +rows[0].active };
}

let cached: { at: number; value: Durations } | null = null;

/** Median and 90th percentile of the last 50 finished runs of the past week; defaults until there are five. */
export async function recentDurations(): Promise<Durations> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const { rows } = await getPostgresPool().query<{ p50: number | null; p90: number | null; samples: string }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS p50, percentile_cont(0.9) WITHIN GROUP (ORDER BY seconds) AS p90, count(*) AS samples
     FROM (SELECT extract(epoch FROM finished_at - coalesce(started_at, created_at))::float8 AS seconds FROM demo.run
           WHERE phase = 'done' AND finished_at > now() - interval '7 days' ORDER BY finished_at DESC LIMIT 50) recent`,
  );
  const row = rows[0];
  const samples = Number(row?.samples ?? 0);
  const value = samples >= 5 && row.p50 && row.p90
    ? { p50: Math.round(row.p50), p90: Math.max(Math.round(row.p90), Math.round(row.p50)), samples }
    : { ...DEFAULT_DURATIONS, samples };
  cached = { at: Date.now(), value };
  return value;
}
