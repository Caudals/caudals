/** Server-side role and access checks for the owner billing routes (spec §6.16; I-9). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audited = vi.hoisted(() => [] as Array<{ orgId: string; action: string }>);
vi.mock("@/lib/evals/domain/identity", () => ({
  requireWorkspace: vi.fn(async (_identity: unknown, orgId: string, action: string) => { audited.push({ orgId, action }); }),
}));

const { buyerDomain, requireBillingOwner } = await import("../../lib/billing/top-ups");

const ORG = "11111111-2222-4333-8444-555555555555";
const identity = (role: "owner" | "editor" | "viewer" | "operator", platformRole: "platform_admin" | "operator" | null = null) => ({
  user: { id: "au_fixture", email: "ana@acme.example", name: "Ana" }, platformRole, workspaces: [{ id: ORG, name: "Acme", role }],
});

describe("billing route access", () => {
  const env = { ...process.env };
  beforeEach(() => {
    audited.length = 0;
    process.env.BILLING_STRIPE_MODE = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.BILLING_TEST_WORKSPACE_IDS = ORG;
  });
  afterEach(() => { process.env = { ...env }; });

  it("lets the owner act in a test workspace", async () => {
    await expect(requireBillingOwner(identity("owner"), ORG)).resolves.toBe("test_workspace");
    expect(audited).toEqual([{ orgId: ORG, action: "manage" }]);
  });
  it("answers 404 to editors, viewers and workspace operators, and lets platform admins only read", async () => {
    for (const role of ["editor", "viewer", "operator"] as const) {
      await expect(requireBillingOwner(identity(role), ORG)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
      await expect(requireBillingOwner(identity(role), ORG, "read")).rejects.toMatchObject({ status: 404 });
    }
    await expect(requireBillingOwner(identity("operator", "platform_admin"), ORG, "read")).resolves.toBe("test_workspace");
    await expect(requireBillingOwner(identity("operator", "platform_admin"), ORG)).rejects.toMatchObject({ status: 404 });
  });
  it("answers 404 to everyone while payments are closed for the workspace", async () => {
    process.env.BILLING_TEST_WORKSPACE_IDS = "";
    process.env.BILLING_CREDITS_ENABLED = "true";
    await expect(requireBillingOwner(identity("owner"), ORG)).rejects.toMatchObject({ status: 404 });
    process.env.BILLING_TEST_WORKSPACE_IDS = ORG;
    process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    await expect(requireBillingOwner(identity("owner"), ORG)).rejects.toMatchObject({ status: 404 });
    expect(audited).toEqual([]);
  });
  it("keys the first top-up bonus to work domains only", () => {
    expect(buyerDomain("ana@ventas.acme.es")).toBe("acme.es");
    expect(buyerDomain("ana@gmail.com")).toBeNull();
  });
});
