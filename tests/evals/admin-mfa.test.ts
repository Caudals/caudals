import { afterEach, describe, expect, it, vi } from "vitest";
import { adminMfaRequired, assertMfaSatisfied, isPlatformStaff, requireRecentSignIn, type EvalIdentity } from "@/lib/evals/domain/identity";
import { evaluationSecurityPath } from "@/components/evals/auth-path";
import { setupKeyFromUri } from "@/components/evals/two-factor-settings";

const base: EvalIdentity = { user: { id: "au_1", email: "a@example.test", name: "A" }, platformRole: null, workspaces: [] };

afterEach(() => vi.unstubAllEnvs());

describe("admin two-factor policy (launch L-08)", () => {
  it("is off unless EVALS_ADMIN_MFA_REQUIRED is exactly true", () => {
    vi.stubEnv("EVALS_ADMIN_MFA_REQUIRED", "");
    expect(adminMfaRequired()).toBe(false);
    vi.stubEnv("EVALS_ADMIN_MFA_REQUIRED", "1");
    expect(adminMfaRequired()).toBe(false);
    vi.stubEnv("EVALS_ADMIN_MFA_REQUIRED", "true");
    expect(adminMfaRequired()).toBe(true);
  });

  it("treats platform roles and workspace operators as staff, never customers", () => {
    expect(isPlatformStaff({ ...base, platformRole: "platform_admin" })).toBe(true);
    expect(isPlatformStaff({ ...base, platformRole: "operator" })).toBe(true);
    expect(isPlatformStaff({ ...base, workspaces: [{ id: "w", name: "W", role: "operator" }] })).toBe(true);
    expect(isPlatformStaff({ ...base, workspaces: [{ id: "w", name: "W", role: "owner" }] })).toBe(false);
  });

  it("blocks staff without TOTP only when it is required", () => {
    expect(() => assertMfaSatisfied({ ...base, mfa: { enabled: false, required: true } })).toThrow(expect.objectContaining({ code: "MFA_ENROLMENT_REQUIRED", status: 403 }));
    expect(() => assertMfaSatisfied({ ...base, mfa: { enabled: true, required: true } })).not.toThrow();
    expect(() => assertMfaSatisfied({ ...base, mfa: { enabled: false, required: false } })).not.toThrow();
  });

  it("asks for a recent sign-in for sensitive actions", () => {
    const now = Date.now();
    expect(() => requireRecentSignIn({ ...base, sessionCreatedAt: new Date(now - 5 * 60_000).toISOString() })).not.toThrow();
    expect(() => requireRecentSignIn({ ...base, sessionCreatedAt: new Date(now - 16 * 60_000).toISOString() })).toThrow(expect.objectContaining({ code: "REAUTHENTICATION_REQUIRED", status: 403 }));
    expect(() => requireRecentSignIn(base)).toThrow(expect.objectContaining({ code: "REAUTHENTICATION_REQUIRED" }));
  });

  it("sends staff to the security page and back to where they were going", () => {
    expect(evaluationSecurityPath("/ops/platform")).toBe("/workspace/security?next=%2Fops%2Fplatform");
    expect(evaluationSecurityPath("/evaluation-entry")).toBe("/workspace/security");
    expect(evaluationSecurityPath("https://evil.example/ops")).toBe("/workspace/security");
  });

  it("shows the setup key from the authenticator URI in groups of four", () => {
    expect(setupKeyFromUri("otpauth://totp/Caudals:a%40example.test?secret=ABCDEFGHIJKLMNOP&issuer=Caudals")).toBe("ABCD EFGH IJKL MNOP");
    expect(setupKeyFromUri("not a uri")).toBe("");
  });
});
