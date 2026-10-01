import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openBrowserMessage, sealBrowserMessage } from "../../lib/evals/security/browser-wire";
import { remoteActionSchema } from "../../lib/evals/contracts/remote-browser";
import { scopedBrowserStorageState } from "../../lib/evals/contracts/browser";

describe("private remote browser protocol", () => {
  it("binds encrypted messages to the request, direction and key version without exposing credentials", () => {
    const keys = new Map([["v1", randomBytes(32)]]), id = randomUUID();
    const value = { text: "fixture-password", state: { cookie: "fixture-session" } };
    const wire = sealBrowserMessage(value, keys, "request", id);
    expect(JSON.stringify(wire)).not.toContain("fixture-password");
    expect(openBrowserMessage(wire, keys, "request", id)).toEqual(value);
    expect(() => openBrowserMessage(wire, keys, "response", id)).toThrow();
    expect(() => openBrowserMessage(wire, keys, "request", randomUUID())).toThrow();
    expect(() => openBrowserMessage({ ...wire, data: wire.data.slice(0, -4) }, keys, "request", id)).toThrow();
  });
  it("allows bounded human input while rejecting arbitrary script and unbounded coordinates", () => {
    expect(remoteActionSchema.safeParse({ action: "evaluate", sessionId: randomUUID(), script: "fetch()" }).success).toBe(false);
    expect(remoteActionSchema.safeParse({ action: "pointer", sessionId: randomUUID(), phase: "down", x: 10000, y: 20 }).success).toBe(false);
    expect(remoteActionSchema.safeParse({ action: "key", sessionId: randomUUID(), key: "Control+a" }).success).toBe(true);
  });
  it("seals each live-stream line to its position, so frames cannot be replayed or reordered", () => {
    const keys = new Map([["v1", randomBytes(32)]]), id = randomUUID();
    const first = sealBrowserMessage({ type: "frame", seq: 1 }, keys, "response", `${id}:0`);
    const second = sealBrowserMessage({ type: "state" }, keys, "response", `${id}:1`);
    expect(openBrowserMessage(first, keys, "response", `${id}:0`)).toEqual({ type: "frame", seq: 1 });
    expect(() => openBrowserMessage(second, keys, "response", `${id}:0`)).toThrow();
    expect(() => openBrowserMessage(first, keys, "response", `${randomUUID()}:0`)).toThrow();
  });
  it("bounds batched input to known human events", () => {
    const sessionId = randomUUID();
    expect(remoteActionSchema.safeParse({ action: "input", sessionId, events: [{ t: "down", x: 10, y: 10 }, { t: "type", text: "123456" }, { t: "key", key: "Enter" }] }).success).toBe(true);
    expect(remoteActionSchema.safeParse({ action: "input", sessionId, events: [] }).success).toBe(false);
    expect(remoteActionSchema.safeParse({ action: "input", sessionId, events: Array.from({ length: 81 }, () => ({ t: "move", x: 1, y: 1 })) }).success).toBe(false);
    expect(remoteActionSchema.safeParse({ action: "input", sessionId, events: [{ t: "script", code: "alert(1)" }] }).success).toBe(false);
    expect(remoteActionSchema.safeParse({ action: "input", sessionId, events: [{ t: "type", text: "x".repeat(201) }] }).success).toBe(false);
  });
  it("retains iframe and session-storage state only inside the captured target scope", () => {
    const state = { scope_origins: ["https://app.example.test", "https://widget.example.test"], cookies: [], origins: [], session_storage: [{ origin: "https://widget.example.test", entries: [{ name: "token", value: "fixture" }] }] };
    expect(scopedBrowserStorageState(state, "https://app.example.test/help")).toEqual(state);
    expect(() => scopedBrowserStorageState(state, "https://other.example.test")).toThrow("browser_session_scope_mismatch");
    expect(() => scopedBrowserStorageState({ ...state, session_storage: [{ origin: "https://sso.example.test", entries: [] }] }, "https://app.example.test")).toThrow("browser_session_scope_mismatch");
  });
});
