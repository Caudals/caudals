import { describe, expect, it, vi, beforeEach } from "vitest";

const { queryRowsMock, getCurrentSupplierSessionMock, revalidatePathMock } =
  vi.hoisted(() => ({
    queryRowsMock: vi.fn(),
    getCurrentSupplierSessionMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

vi.mock("@/lib/supplier/session", () => ({
  getCurrentSupplierSession: getCurrentSupplierSessionMock,
}));

import { createSupplierAssetDeclaration } from "@/lib/actions/supplier-portal-actions";

describe("supplier portal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentSupplierSessionMock.mockResolvedValue({
      status: "authorized",
      session: {
        authUser: {
          id: "au_supplier",
          email: "supplier.fixture@caudals.local",
          name: "Supplier Fixture",
        },
        supplier: {
          id: "or_supplier",
          displayName: "Supplier Co",
          legalName: "Supplier Company SL",
          jurisdiction: "ES",
        },
        authOrganization: {
          id: "ao_supplier",
          name: "Supplier Portal",
        },
        tenantOrgId: "or_tenant",
        role: "supplier_admin",
      },
    });
  });

  it("creates supplier asset declarations through tenant-scoped audited SQL", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "sa_created",
        audit_event_id: "ae_created",
      },
    ]);

    await expect(
      createSupplierAssetDeclaration({
        name: "Retail receipt corpus",
        modality: "document",
        declaredVolume: "100k PDFs with JSON metadata",
        refreshPolicy: "scheduled",
        sensitivity: "pii",
        intendedAvailability: "private",
        rightsSummary:
          "Supplier owns the operational records and has AI-training rights.",
        ownershipConfirmed: true,
        aiTrainingRights: true,
        derivativeRights: true,
        endUserConsent: true,
        thirdPartyContent: false,
      }),
    ).resolves.toEqual({
      ok: true,
      assetId: "sa_created",
      auditEventId: "ae_created",
    });

    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("supplier_asset_declared"),
      expect.arrayContaining(["or_tenant", "or_supplier", "document"]),
      { orgId: "or_tenant" },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/supplier");
  });

  it("requires explicit ownership and AI-training rights", async () => {
    await expect(
      createSupplierAssetDeclaration({
        name: "Retail receipt corpus",
        modality: "document",
        declaredVolume: "100k PDFs with JSON metadata",
        refreshPolicy: "scheduled",
        sensitivity: "pii",
        intendedAvailability: "private",
        rightsSummary: "Rights are still being reviewed by the supplier.",
        ownershipConfirmed: false,
        aiTrainingRights: false,
        derivativeRights: false,
      }),
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });
});
