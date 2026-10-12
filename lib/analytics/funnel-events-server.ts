import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { generatePrefixedUlid } from "@/lib/db/ids";
import { queryRows } from "@/lib/db/client";
import { analyticsPath, CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES, sanitizeAttribution, sanitizePayload, type Attribution, type ProductEventName, type ProductEventPayload } from "./events";
export const analyticsV2Enabled = () => process.env.ANALYTICS_EVENTS_V2 === "true";
export const analyticsHash = (id: string) => createHash("sha256").update(`caudals-analytics-v2:${id}`).digest("hex");
export type RecordProductEventInput = {
  eventName: ProductEventName; source: "client" | "server";
  orgId?: string | null; runId?: string | null; eventKey?: string;
  path?: string | null; sessionId?: string | null;
  payload?: ProductEventPayload; attribution?: Attribution;
};
/** Append inside a domain transaction when supplied. Analytics cannot abort that transaction. */
export async function recordProductEvent(input: RecordProductEventInput, db?: PoolClient) {
  // L-03 lifecycle collection predates this rollout flag and remains available.
  if (!analyticsV2Enabled() && !["demo_started", "demo_finished"].includes(input.eventName)) return { skipped: true };
  const names: readonly string[] = input.source === "client" ? CLIENT_EVENT_NAMES : SERVER_EVENT_NAMES;
  if (!names.includes(input.eventName)) return { skipped: true };
  const uuid = (value?: string | null) => value && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  const values = [generatePrefixedUlid("pa"), input.eventName, input.source, analyticsPath(input.path), uuid(input.sessionId), JSON.stringify(sanitizePayload(input.eventName, input.payload)), uuid(input.orgId), input.runId ? analyticsHash(input.runId) : null, JSON.stringify(sanitizeAttribution(input.attribution)), input.eventKey ? analyticsHash(`${input.eventName}:${input.eventKey}`) : null];
  // During rolling deploy, only the two existing L-03 names may predate migration 082.
  const sql = `SELECT evals.append_analytics_event($1,$2,$3,$4,$5,$6::jsonb,$7::uuid,$8,$9::jsonb,$10)`;
  let savepoint = false;
  try {
    if (db) { await db.query("SAVEPOINT analytics_event"); savepoint = true; await db.query(sql, values); await db.query("RELEASE SAVEPOINT analytics_event"); }
    else await queryRows(sql, values);
    return { ok: true };
  } catch (error) {
    if (db && savepoint) { await db.query("ROLLBACK TO SAVEPOINT analytics_event"); await db.query("RELEASE SAVEPOINT analytics_event"); }
    // Never log exception messages, payloads or query values.
    console.error("analytics_write_failed", { event: input.eventName, code: typeof error === "object" && error && "code" in error ? String(error.code).slice(0, 5) : "unknown" });
    return { error: "analytics_write_failed" };
  }
}
