import { describe, expect, it } from "vitest";

import { getSentryOptions } from "@/lib/observability/sentry-config";
import { scrubBreadcrumb, scrubEvent, scrubString, scrubUrl } from "@/lib/observability/sentry-scrub.mjs";

describe("Sentry personal-data scrubbing (launch L-08)", () => {
  it("redacts emails, phone numbers, tokens, IPs and connection strings", () => {
    const text = scrubString(
      "jane.doe@example.com +34 600 000 000 sk_live_0123456789abcdefghij Bearer abc.def.ghi-1234567 203.0.113.7 2001:db8:0:0:0:0:2:1 postgres://user:secret@db:5432/caudals eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl",
    );
    for (const leaked of ["jane.doe", "600 000 000", "sk_live", "abc.def", "203.0.113.7", "2001:db8", "secret@db", "eyJhbGciOi"]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("keeps what debugging needs: UUIDs, dates, codes and short numbers", () => {
    const text = scrubString("run 3f2b8c1e-9a4d-4c2e-8f1a-0b9c8d7e6f5a failed at 2026-10-12 10:28:13 with model_timeout after 120 s (HTTP 503)");
    expect(text).toBe("run 3f2b8c1e-9a4d-4c2e-8f1a-0b9c8d7e6f5a failed at 2026-10-12 10:28:13 with model_timeout after 120 s (HTTP 503)");
  });

  it("strips users, headers, cookies, bodies, query strings and local variables from events", () => {
    const event = scrubEvent({
      user: { id: "u1", email: "a@b.co", ip_address: "203.0.113.7" },
      request: { method: "POST", url: "https://app.caudals.com/share?token=abc#frag", headers: { cookie: "x" }, cookies: { a: "b" }, data: "{\"password\":\"x\"}", query_string: "token=abc" },
      exception: { values: [{ type: "Error", value: "failed for a@b.co", stacktrace: { frames: [{ filename: "x.ts", vars: { email: "a@b.co" } }] } }] },
      extra: { email: "a@b.co", note: "call +34 600 000 000", nested: { password: "x", ok: 1 } },
      contexts: { runtime: { name: "node" }, response: { body: "secret" } },
      breadcrumbs: [{ category: "fetch", data: { url: "https://x.test/a?b=c", arguments: ["a@b.co"] }, message: "to a@b.co" }],
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ method: "POST", url: "https://app.caudals.com/share" });
    expect(event.exception.values[0].value).toBe("failed for [email]");
    expect(event.exception.values[0].stacktrace.frames[0]).toEqual({ filename: "x.ts" });
    expect(event.extra).toEqual({ note: "call [number]", nested: { ok: 1 } });
    expect(event.contexts).toEqual({ runtime: { name: "node" } });
    expect(event.breadcrumbs).toEqual([{ category: "fetch", data: { url: "https://x.test/a" }, message: "to [email]" }]);
    expect(JSON.stringify(event)).not.toMatch(/a@b\.co|203\.0\.113|password|token=abc/);
  });

  it("scrubs breadcrumbs and URLs on their own", () => {
    expect(scrubBreadcrumb({ message: "user x@y.io", data: { to: "/workspace/invitations#token=abc", cookie: "c" } })).toEqual({ message: "user [email]", data: { to: "/workspace/invitations" } });
    expect(scrubUrl("/api/demo/runs/3f2b8c1e-9a4d-4c2e-8f1a-0b9c8d7e6f5a?x=1")).toBe("/api/demo/runs/3f2b8c1e-9a4d-4c2e-8f1a-0b9c8d7e6f5a");
    expect(scrubUrl("/share/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc")).toBe("/share/[token]");
  });

  it("wires the scrubber, release and service tag into the SDK options", () => {
    const options = getSentryOptions({ SENTRY_DSN: "https://public@example.com/1", SENTRY_RELEASE: "abc123", SENTRY_SERVICE: "evals-worker" });
    expect(options).toMatchObject({ enabled: true, release: "abc123", serverName: "evals-worker", sendDefaultPii: false, includeLocalVariables: false, initialScope: { tags: { service: "evals-worker" } } });
    const event = options.beforeSend!({ user: { email: "a@b.co" }, message: "x@y.io" } as never, {} as never) as { user?: unknown; message?: string };
    expect(event.user).toBeUndefined();
    expect(event.message).toBe("[email]");
  });
});
