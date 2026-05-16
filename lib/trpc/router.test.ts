import { describe, expect, it, vi } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import { getBuyerWorkspaceData } from "@/lib/buyer/workspace";
import { getCurrentBuyerSession } from "@/lib/buyer/session";
import { getCurrentSupplierSession } from "@/lib/supplier/session";
import { getSupplierWorkspaceData } from "@/lib/supplier/workspace";

vi.mock("@/lib/buyer/session", () => ({
  getCurrentBuyerSession: vi.fn(),
}));

vi.mock("@/lib/buyer/workspace", () => ({
  getBuyerWorkspaceData: vi.fn(),
}));

vi.mock("@/lib/supplier/session", () => ({
  getCurrentSupplierSession: vi.fn(),
}));

vi.mock("@/lib/supplier/workspace", () => ({
  getSupplierWorkspaceData: vi.fn(),
}));

const buyerSession = {
  authUser: { id: "au_buyer", email: "buyer@example.com", name: "Buyer" },
  buyer: {
    id: "or_buyer",
    displayName: "Buyer Co",
    legalName: "Buyer Co Inc",
    jurisdiction: "US",
  },
  authOrganization: { id: "ao_buyer", name: "Buyer Workspace" },
  tenantOrgId: "or_tenant",
  role: "buyer_admin",
} as const;

const supplierSession = {
  authUser: {
    id: "au_supplier",
    email: "supplier@example.com",
    name: "Supplier",
  },
  supplier: {
    id: "or_supplier",
    displayName: "Supplier Co",
    legalName: "Supplier Co SL",
    jurisdiction: "ES",
  },
  authOrganization: { id: "ao_supplier", name: "Supplier Portal" },
  tenantOrgId: "or_tenant",
  role: "supplier_admin",
} as const;

function createCaller() {
  return appRouter.createCaller({
    headers: new Headers({ "x-request-id": "req_test" }),
    requestId: "req_test",
    userAgent: "vitest",
  });
}

describe("tRPC router scaffold", () => {
  it("exposes a minimal hidden health procedure", async () => {
    const caller = createCaller();

    await expect(caller.health()).resolves.toEqual({
      ok: true,
      surface: "future_buyer_supplier_scaffold",
      requestId: "req_test",
    });
  });

  it("exposes the authenticated buyer workspace through tRPC", async () => {
    vi.mocked(getCurrentBuyerSession).mockResolvedValueOnce({
      status: "authorized",
      session: buyerSession,
    });
    vi.mocked(getBuyerWorkspaceData).mockResolvedValueOnce({
      buyer: buyerSession.buyer,
      authOrganization: buyerSession.authOrganization,
      role: buyerSession.role,
      summary: {
        deliveryCount: 1,
        activeSubscriptions: 1,
        nextRefreshAt: null,
        averageQualityScore: 0.91,
        openInvoiceCount: 0,
        openInvoiceAmountCents: 0,
        activeIntegrationCount: 1,
      },
      deliveries: [],
      subscriptions: [],
      invoices: [],
      integrations: [],
    });

    const caller = createCaller();

    await expect(caller.buyer.workspace()).resolves.toMatchObject({
      buyer: { id: "or_buyer" },
      summary: { deliveryCount: 1 },
    });
    expect(getCurrentBuyerSession).toHaveBeenCalledWith(
      expect.any(Headers),
    );
    expect(getBuyerWorkspaceData).toHaveBeenCalledWith(buyerSession);
  });

  it("rejects unauthenticated buyer workspace access", async () => {
    vi.mocked(getCurrentBuyerSession).mockResolvedValueOnce({
      status: "unauthenticated",
    });

    const caller = createCaller();

    await expect(caller.buyer.workspace()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("exposes the authenticated supplier portal through tRPC", async () => {
    vi.mocked(getCurrentSupplierSession).mockResolvedValueOnce({
      status: "authorized",
      session: supplierSession,
    });
    vi.mocked(getSupplierWorkspaceData).mockResolvedValueOnce({
      supplier: supplierSession.supplier,
      authOrganization: supplierSession.authOrganization,
      role: supplierSession.role,
      summary: {
        assetCount: 1,
        samplesReceived: 1,
        buildsInFlight: 1,
        rightsApproved: 1,
        payoutCount: 1,
        totalPayoutCents: 240000,
        paidPayoutCents: 0,
        heldPayoutCents: 240000,
        pendingPayoutCents: 0,
        activePayoutIntegrationCount: 1,
        stripeConnectStatus: "restricted",
      },
      assets: [],
      builds: [],
      payouts: [],
      payoutIntegrations: [],
    });

    const caller = createCaller();

    await expect(caller.supplier.workspace()).resolves.toMatchObject({
      supplier: { id: "or_supplier" },
      summary: { assetCount: 1 },
    });
    expect(getCurrentSupplierSession).toHaveBeenCalledWith(
      expect.any(Headers),
    );
    expect(getSupplierWorkspaceData).toHaveBeenCalledWith(supplierSession);
  });

  it("rejects accounts without a supplier portal assignment", async () => {
    vi.mocked(getCurrentSupplierSession).mockResolvedValueOnce({
      status: "unauthorized",
      authUser: {
        id: "au_other",
        email: "other@example.com",
        name: "Other",
      },
    });

    const caller = createCaller();

    await expect(caller.supplier.workspace()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
