import { describe, expect, it } from "vitest";
import { connectionState, decideAutostart, helpReason, siteState, type AutostartFacts } from "@/lib/evals/repositories/onboarding";
import { passwordStrength } from "@/components/evals/self-serve-signup";

const source = (extra: Partial<AutostartFacts["sources"][number]> = {}) => ({ id: "s", website_status: "completed", website_reason: null, start_url: "https://www.shop.example/help", revision_id: "r", ingestion_status: "completed", ingestion_reason: null, ...extra });
const facts = (extra: Partial<AutostartFacts> = {}): AutostartFacts => ({
  evaluation: { archived: false, title: "Shop", suiteSelected: false, jobs: 0, cap: 50 },
  sources: [source()],
  connection: { kind: "website", endpoint: "https://shop.example/chat", status: "ready", error_code: null, created_at: new Date() },
  createdAt: new Date(),
  ...extra,
});

describe("automatic start rules (launch L-06)", () => {
  it("starts at the plan's test limit once the site is read and the chat is reachable", () => {
    expect(decideAutostart(facts())).toEqual({ status: "start", revisions: ["r"], maxCases: 50 });
    expect(decideAutostart(facts({ evaluation: { archived: false, title: "Shop", suiteSelected: false, jobs: 0, cap: null } }))).toMatchObject({ maxCases: 50 });
    expect(decideAutostart(facts({ evaluation: { archived: false, title: "Shop", suiteSelected: false, jobs: 0, cap: 500 } }))).toMatchObject({ maxCases: 200 });
  });
  it("starts when the chat only needs help with automation, or has no check because it needs a key", () => {
    expect(decideAutostart(facts({ connection: { kind: "website", endpoint: "https://shop.example", status: "needs_operator", error_code: "recipe_not_found", created_at: new Date() } })).status).toBe("start");
    expect(decideAutostart(facts({ connection: { kind: "openai_compatible", endpoint: "https://api.shop.example/v1", status: null, error_code: null, created_at: null } })).status).toBe("start");
  });
  it("waits while the site is read or the check runs, but not forever for the check", () => {
    expect(decideAutostart(facts({ sources: [source({ website_status: "running", revision_id: null })] }))).toEqual({ status: "waiting", reason: "reading_site" });
    const checking = { kind: "website", endpoint: "https://shop.example", status: "queued", error_code: null, created_at: new Date() };
    expect(decideAutostart(facts({ connection: checking }))).toEqual({ status: "waiting", reason: "checking_connection" });
    expect(decideAutostart(facts({ connection: { ...checking, created_at: new Date(Date.now() - 6 * 60_000) } })).status).toBe("start");
  });
  it("never spends model time on an unreachable chat or an unreadable site", () => {
    expect(decideAutostart(facts({ connection: { kind: "website", endpoint: "https://shop.example", status: "needs_operator", error_code: "destination_denied", created_at: new Date() } }))).toEqual({ status: "blocked", reason: "chat_unreachable" });
    expect(decideAutostart(facts({ connection: { kind: "openai_compatible", endpoint: "https://api.shop.example", status: "failed", error_code: "target_unreachable", created_at: new Date() } }))).toEqual({ status: "blocked", reason: "chat_unreachable" });
    expect(decideAutostart(facts({ sources: [source({ website_status: "failed", website_reason: "website_capture_unavailable", revision_id: null })] }))).toEqual({ status: "blocked", reason: "site_unreadable" });
    expect(decideAutostart(facts({ sources: [] }))).toEqual({ status: "blocked", reason: "no_reference_pages" });
  });
  it("gives way to a manual start, a removed evaluation and old intents", () => {
    expect(decideAutostart(facts({ evaluation: { archived: false, title: "Shop", suiteSelected: false, jobs: 1, cap: 50 } }))).toEqual({ status: "superseded", reason: "manual_start" });
    expect(decideAutostart(facts({ evaluation: null }))).toEqual({ status: "canceled", reason: "evaluation_removed" });
    expect(decideAutostart(facts({ createdAt: new Date(Date.now() - 3 * 24 * 3600_000) }))).toEqual({ status: "expired", reason: "autostart_timeout" });
  });
  it("describes site and connection for the page without raw addresses", () => {
    expect(siteState([source({ website_status: "extracting", revision_id: null })])).toMatchObject({ state: "reading", host: "shop.example" });
    expect(connectionState({ kind: "website", endpoint: "https://shop.example/chat?x=1", status: "needs_operator", error_code: "captcha_present", created_at: new Date() })).toEqual({ state: "attention", code: "captcha_present", kind: "website", host: "shop.example" });
    expect(connectionState(null).state).toBe("none");
  });
  it("derives the help reason from the evaluation's own state", () => {
    const base = { enabled: true, autostart: null, generation: null, help: null };
    expect(helpReason({ ...base, connection: { state: "unreachable", code: "destination_denied", kind: "website", host: null }, site: { state: "ready", code: null, host: null } })).toBe("chat_unreachable");
    expect(helpReason({ ...base, connection: { state: "attention", code: "browser_session_unavailable", kind: "website", host: null }, site: { state: "ready", code: null, host: null } })).toBe("chat_login_required");
    expect(helpReason({ ...base, connection: { state: "ready", code: null, kind: "website", host: null }, site: { state: "failed", code: null, host: null } })).toBe("site_unreadable");
  });
});

describe("password strength hint (launch L-06)", () => {
  it("rates by length first, then variety", () => {
    expect(passwordStrength("short")).toBe("weak");
    expect(passwordStrength("aaaaaaaaaaaaaaaa")).toBe("weak");
    expect(passwordStrength("abcdefghijkl")).toBe("fair");
    expect(passwordStrength("Abcdefgh1jkl")).toBe("strong");
    expect(passwordStrength("copper lantern orbit tide")).toBe("strong");
  });
});
