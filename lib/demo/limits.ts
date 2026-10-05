import "server-only";
import { callsToday, dailyCallLimit, providerRemaining } from "./llm";
import { usage } from "./store";

/**
 * Who may start a demo. One per visitor a day; three a day for any one site
 * (so nobody points the demo at a third party's chatbot all day); three at a
 * time overall; and only while today's free model quota can finish a run.
 */
const CALLS_PER_RUN = 3;

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export class LimitError extends Error {
  constructor(code: "visitor_limit" | "site_limit" | "busy" | "capacity" | "closed") { super(code); }
}

/** Whether a new demo can finish today, as far as model quota goes. */
export async function capacityOpen() {
  const [used, remaining] = await Promise.all([callsToday(), providerRemaining()]);
  return dailyCallLimit() - used >= CALLS_PER_RUN && (remaining === null || remaining >= CALLS_PER_RUN);
}

export async function admit(clientHash: string, targetHost: string, docsHost: string) {
  const counts = await usage(clientHash, targetHost, docsHost);
  if (counts.clientRuns >= intEnv("DEMO_RUNS_PER_VISITOR", 1) || counts.clientAttempts >= intEnv("DEMO_ATTEMPTS_PER_VISITOR", 6)) throw new LimitError("visitor_limit");
  const perSite = intEnv("DEMO_RUNS_PER_SITE", 3);
  if (counts.targetRuns >= perSite || counts.docsRuns >= perSite) throw new LimitError("site_limit");
  if (counts.active >= intEnv("DEMO_MAX_ACTIVE", 3)) throw new LimitError("busy");
  if (!(await capacityOpen())) throw new LimitError("capacity");
}
