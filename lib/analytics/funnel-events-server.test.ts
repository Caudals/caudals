import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ queryRows }));
import { recordProductEvent, analyticsHash } from "./funnel-events-server";
describe("v2 server ingestion", () => {
  beforeEach(() => { vi.stubEnv("ANALYTICS_EVENTS_V2", "true"); queryRows.mockReset().mockResolvedValue([]); });
  afterEach(() => vi.unstubAllEnvs());
  it("never stores identity, arbitrary payload text or raw run IDs", async () => {
    await recordProductEvent({eventName:"demo_finished", source:"server",runId:"private-run",eventKey:"private-run",path:"/en/demo?token=secret",payload:{outcome:"done",email:"somebody@example.com",model_used:"org/model",scored:8},attribution:{utm_source:"newsletter",ref:"person@example.com"}});
    const values = queryRows.mock.calls[0][1];
    expect(JSON.stringify(values)).not.toMatch(/somebody|private-run|secret|person@/);
    expect(values).toContain(analyticsHash("private-run"));
    expect(values[5]).toBe(JSON.stringify({outcome:"done",scored:8,model_used:"org/model"}));
    expect(values[8]).toBe('{"utm_source":"newsletter"}');
  });
  it("rejects source spoofing and gates new events at runtime", async () => {
    expect(await recordProductEvent({eventName:"account_created",source:"client"})).toEqual({skipped:true});
    vi.stubEnv("ANALYTICS_EVENTS_V2","false");
    expect(await recordProductEvent({eventName:"account_created",source:"server"})).toEqual({skipped:true});
    expect(queryRows).not.toHaveBeenCalled();
    await recordProductEvent({eventName:"demo_started",source:"server"});
    expect(queryRows).toHaveBeenCalledOnce();
  });
  it("keeps the emailed-share consent record when the rollout flag is off, but not a copied link (launch L-04)", async () => {
    vi.stubEnv("ANALYTICS_EVENTS_V2","false");
    expect(await recordProductEvent({eventName:"demo_report_shared",source:"server",runId:"run-1",eventKey:"run-1"})).toEqual({skipped:true});
    expect(await recordProductEvent({eventName:"demo_report_shared",source:"server",runId:"run-1",eventKey:"run-1:email:k",payload:{channel:"email",consent:true,email:"colleague@example.com"}})).toEqual({ok:true});
    const values = queryRows.mock.calls[0][1];
    expect(values[5]).toBe(JSON.stringify({channel:"email",consent:true}));
    expect(JSON.stringify(values)).not.toMatch(/colleague@|run-1/);
  });
});
