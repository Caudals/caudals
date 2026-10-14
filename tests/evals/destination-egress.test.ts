/**
 * Launch L-19 (spec v2 P-28): every destination passes the same egress checks
 * as webhooks. Private, loopback, link-local, CGNAT and mapped addresses are
 * refused for any DNS answer; the socket is pinned to the address that was
 * checked, so a DNS answer that changes afterwards (rebinding) is never used;
 * Slack URLs must be Slack's; Teams keeps its signed query string; email
 * destinations are a member's address or on a member's company domain.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/evals/repositories/db", () => ({ withTenant: vi.fn() }));
vi.mock("@/lib/analytics/funnel-events-server", () => ({ recordProductEvent: vi.fn() }));
const requests: Array<{ url: URL; options: Record<string, any> }> = [];
vi.mock("node:https", () => {
  const request = (url: URL, options: Record<string, any>, onResponse: (response: EventEmitter & { statusCode: number; resume: () => void }) => void) => {
    requests.push({ url, options });
    const req = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: (error: Error) => void };
    req.destroy = (error) => req.emit("error", error);
    req.end = () => {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, resume: () => undefined });
      onResponse(response);
      queueMicrotask(() => response.emit("end"));
    };
    return req;
  };
  return { default: { request }, request };
});

const { validatePublicDestination, isPublicAddress } = await import("@/lib/evals/connectors/egress");
const { checkSlackUrl, checkTeamsUrl, emailDestinationAllowed, postWebhook, targetHint } = await import("@/lib/evals/monitoring/webhooks");

const answers = (...addresses: string[]) => vi.fn(async () => addresses.map(address => ({ address, family: address.includes(":") ? 6 : 4 }))) as never;
const SLACK = "https://hooks.slack.com/services/T0000/B0000/abcdefghijklmnop";
const TEAMS = "https://prod-12.westeurope.logic.azure.com:443/workflows/0123/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers&sv=1.0&sig=AbCdEf";

describe("destination egress (launch L-19)", () => {
  it("refuses private, loopback, link-local, CGNAT, documentation and mapped addresses", async () => {
    for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.3.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "198.18.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "2001:db8::1"]) {
      expect(isPublicAddress(address), address).toBe(false);
      await expect(validatePublicDestination(SLACK, answers(address)), address).rejects.toThrow("destination_denied");
      await expect(postWebhook(TEAMS, "{}", {}, { allowQuery: true, lookup: answers(address) }), address).rejects.toThrow("destination_denied");
    }
    // One private answer among public ones is enough to refuse.
    await expect(validatePublicDestination(SLACK, answers("34.1.2.3", "10.1.1.1"))).rejects.toThrow("destination_denied");
    expect(requests).toHaveLength(0);
  });

  it("pins the socket to the address it checked (DNS rebinding)", async () => {
    let calls = 0;
    // The first answer is public; any later lookup would point inside the network.
    const lookup = vi.fn(async () => (calls++ === 0 ? [{ address: "34.1.2.3", family: 4 }] : [{ address: "127.0.0.1", family: 4 }])) as never;
    expect(await postWebhook(SLACK, "{}", {}, { lookup })).toBe(200);
    expect(calls).toBe(1);
    const sent = requests.at(-1)!;
    expect(sent.options.agent).toBe(false);
    const resolved = await new Promise<string>((resolve) => sent.options.lookup("hooks.slack.com", { all: false }, (_error: unknown, address: string) => resolve(address)));
    expect(resolved).toBe("34.1.2.3");
    const all = await new Promise<unknown>((resolve) => sent.options.lookup("hooks.slack.com", { all: true }, (_error: unknown, list: unknown) => resolve(list)));
    expect(all).toEqual([{ address: "34.1.2.3", family: 4 }]);
    expect(calls).toBe(1);
  });

  it("keeps the Teams query string only for Teams and refuses it elsewhere", async () => {
    await expect(validatePublicDestination(TEAMS, answers("20.1.2.3"))).rejects.toThrow("destination_invalid");
    expect((await validatePublicDestination(TEAMS, answers("20.1.2.3"), { allowQuery: true })).url.search).toContain("sig=AbCdEf");
    expect(await postWebhook(TEAMS, "{}", {}, { allowQuery: true, lookup: answers("20.1.2.3") })).toBe(200);
    expect(requests.at(-1)!.url.href).toBe(new URL(TEAMS).href);
    for (const bad of ["http://hooks.example.com/x", "https://user:pass@hooks.example.com/x", "https://hooks.example.com/x#frag", "not a url"]) {
      await expect(validatePublicDestination(bad, answers("20.1.2.3"), { allowQuery: true }), bad).rejects.toThrow("destination_invalid");
    }
  });

  it("accepts only Slack's own incoming-webhook URLs for Slack", () => {
    expect(checkSlackUrl(SLACK)).toBe(SLACK);
    expect(checkSlackUrl("https://hooks.slack-gov.com/services/T0000/B0000/abcdefghijkl")).toContain("slack-gov");
    for (const bad of ["https://hooks.slack.com.evil.example/services/T0000/B0000/abcdefghij", "http://hooks.slack.com/services/T0000/B0000/abcdefghij",
      "https://hooks.slack.com/services/T0000/B0000/abcdefghij?x=1", "https://hooks.slack.com/other/T0000/B0000/abcdefghij", "https://hooks.slack.com:8443/services/T0000/B0000/abcdefghij",
      "https://10.0.0.1/services/T0000/B0000/abcdefghij"]) {
      expect(() => checkSlackUrl(bad), bad).toThrow(/Slack/);
    }
    expect(checkTeamsUrl(TEAMS)).toBe(new URL(TEAMS).href);
    expect(() => checkTeamsUrl("https://u:p@example.com/x")).toThrow(/Teams/);
  });

  it("allows email destinations on a member's address or company domain only", async () => {
    const members = ["ana@acme.com", "joe.personal@gmail.com"];
    expect(await emailDestinationAllowed("alerts@acme.com", members)).toBe(true);
    expect(await emailDestinationAllowed("QA@Support.Acme.com", members)).toBe(true);
    expect(await emailDestinationAllowed("joe.personal@gmail.com", members)).toBe(true);
    expect(await emailDestinationAllowed("someone.else@gmail.com", members)).toBe(false);
    expect(await emailDestinationAllowed("victim@other.com", members)).toBe(false);
    expect(await emailDestinationAllowed("x@mailinator.com", ["y@mailinator.com"])).toBe(false);
    expect(await emailDestinationAllowed("not-an-address", members)).toBe(false);
  });

  it("shows a masked hint, never the credential", () => {
    expect(targetHint("slack", SLACK)).toBe("hooks.slack.com · …mnop");
    expect(targetHint("teams", TEAMS)).toBe("prod-12.westeurope.logic.azure.com · …CdEf");
    expect(targetHint("email", "alerts@acme.com")).toBe("al•••@acme.com");
  });
});
