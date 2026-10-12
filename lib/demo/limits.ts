import "server-only";
import { fallbackEnabled, fallbackForced, intEnv, maxActive, queueEnabled, queueMax } from "./config";
import { fallbackBudget, fallbackConfig, runEstimateEur } from "./fallback";
import { isDown } from "./health";
import { callsToday, dailyCallLimit, providerRemaining } from "./llm";
import { usage } from "./store";

/**
 * Who may start a demo. One per visitor a day; three a day for any one site
 * (so nobody points the demo at a third party's chatbot all day). Without the
 * queue: three at a time overall, and only while today's model quota can
 * finish a run. With the queue (DEMO_QUEUE_ENABLED), a run beyond those waits
 * its turn instead (lib/demo/queue.ts).
 */
const CALLS_PER_RUN = 4;

export class LimitError extends Error {
  constructor(code: "visitor_limit" | "site_limit" | "busy" | "capacity" | "closed" | "queue_full") { super(code); }
}

/** Circuits only steer runs once the queue or the fallback is on; off, the demo behaves as before. */
const circuits = () => queueEnabled() || fallbackEnabled();

/** Whether the primary (DGX) model can take a new run now. */
export async function primaryAvailable() {
  if (fallbackForced() || (circuits() && isDown("primary"))) return false;
  const [used, remaining] = await Promise.all([callsToday(), providerRemaining()]);
  return dailyCallLimit() - used >= CALLS_PER_RUN && (remaining === null || remaining >= CALLS_PER_RUN);
}

/** Whether the fallback model is on, configured, healthy and has a run's worth of today's cap left. */
export async function fallbackAvailable() {
  if (!fallbackEnabled() || isDown("fallback")) return false;
  const config = fallbackConfig();
  if (!config.key) return false;
  const budget = await fallbackBudget(config.dailyCapEur);
  return budget.remainingEur >= runEstimateEur(config);
}

/** Whether a new demo can finish now, as far as models go. */
export async function capacityOpen() {
  return (await primaryAvailable()) || (await fallbackAvailable());
}

export async function admit(clientHash: string, targetHost: string, docsHost: string) {
  const counts = await usage(clientHash, targetHost, docsHost);
  if (counts.clientRuns >= intEnv("DEMO_RUNS_PER_VISITOR", 1) || counts.clientAttempts >= intEnv("DEMO_ATTEMPTS_PER_VISITOR", 6)) throw new LimitError("visitor_limit");
  const perSite = intEnv("DEMO_RUNS_PER_SITE", 3);
  if (counts.targetRuns >= perSite || counts.docsRuns >= perSite) throw new LimitError("site_limit");
  if (queueEnabled()) {
    if (counts.queued >= queueMax()) throw new LimitError("queue_full");
    return;
  }
  if (counts.active >= maxActive()) throw new LimitError("busy");
  if (!(await capacityOpen())) throw new LimitError("capacity");
}
