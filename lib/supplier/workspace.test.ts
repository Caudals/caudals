import { describe, expect, it, vi } from "vitest";
import { getSupplierWorkspaceData } from "@/lib/supplier/workspace";
import type { CurrentSupplierSession } from "@/lib/supplier/session";

const session: CurrentSupplierSession = {
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
};

describe("supplier workspace data", () => {
  it("filters assets and builds by supplier organization under tenant RLS", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "sa_asset",
          name: "Receipt corpus",
          modality: "document",
          declaredVolume: { summary: "100k PDFs" },
          refreshPolicy: "scheduled",
          sensitivity: "pii",
          rightsSummary: {
            ownershipConfirmed: true,
            aiTrainingRights: true,
          },
          state: "approved",
          createdAt: "2026-05-10T12:00:00.000Z",
          updatedAt: "2026-05-10T12:00:00.000Z",
          sampleUploadUri: "s3://sample",
          sampleUploadFilename: "sample.zip",
          sampleUploadBytes: "1024",
          sampleUploadContentType: "application/zip",
          sampleUploadRequestedAt: "2026-05-10T12:00:00.000Z",
          sampleUploadReceivedAt: "2026-05-10T12:00:00.000Z",
          supplierPortalMetadata: {},
          contractId: "ct_supplier",
          contractState: "active",
          contractEndsAt: null,
          licenseClauses: [
            {
              id: "lc_1",
              permitsTrain: true,
              permitsFinetune: false,
              permitsEval: true,
              permitsCommercialInference: true,
              permitsRedistribute: false,
              exclusivity: "none",
              geo: ["WW"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "bd_1",
          title: "Receipt build",
          state: "qa",
          etaAt: "2026-05-20T12:00:00.000Z",
          qScore: "0.91",
          costBudgetCents: "250000",
          costUsedCents: "100000",
          opportunityId: "so_1",
          opportunityTitle: "Supplier intake",
          opportunityState: "full_active",
          latestGate: "G-7",
          latestGateState: "review",
        },
      ]);

    const data = await getSupplierWorkspaceData(session, query);

    expect(data.summary).toMatchObject({
      assetCount: 1,
      samplesReceived: 1,
      buildsInFlight: 1,
      rightsApproved: 1,
    });
    expect(data.assets[0]).toMatchObject({
      id: "sa_asset",
      sampleUpload: { bytes: 1024 },
    });
    expect(data.builds[0]).toMatchObject({
      id: "bd_1",
      qScore: 0.91,
      latestGate: { key: "G-7" },
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("sa.supplier_org_id = $1"),
      ["or_supplier", "or_tenant"],
      { orgId: "or_tenant" },
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("so.supplier_org_id = $1"),
      ["or_supplier", "or_tenant"],
      { orgId: "or_tenant" },
    );
  });
});
