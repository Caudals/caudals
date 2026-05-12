import { describe, expect, it } from "vitest";
import {
  buildSupplierSampleUploadPlan,
  isAllowedSupplierSampleMime,
  validateSupplierSampleUploadInput,
} from "@/lib/supplier/uploads";
import type { CurrentSupplierSession } from "@/lib/supplier/session";

const session: CurrentSupplierSession = {
  authUser: { id: "au_supplier", email: "supplier@caudals.test", name: "Supplier" },
  supplier: {
    id: "or_supplier",
    displayName: "Supplier Co",
    legalName: "Supplier Co",
    jurisdiction: "ES",
  },
  authOrganization: { id: "ao_supplier", name: "Supplier Portal" },
  tenantOrgId: "or_tenant",
  role: "supplier_admin",
};

describe("supplier sample uploads", () => {
  it("allows data sample file types and rejects unsafe names", () => {
    expect(isAllowedSupplierSampleMime("application/zip")).toBe(true);
    expect(isAllowedSupplierSampleMime("image/png")).toBe(true);
    expect(isAllowedSupplierSampleMime("application/x-msdownload")).toBe(false);

    expect(
      validateSupplierSampleUploadInput({
        assetId: "sa_01J20000000000000000000001",
        fileName: "../sample.zip",
        contentType: "application/zip",
        sizeBytes: 10,
      }),
    ).toMatch(/file name/i);
  });

  it("builds supplier-scoped object keys for signed uploads", () => {
    const plan = buildSupplierSampleUploadPlan(session, {
      assetId: "sa_01J20000000000000000000001",
      fileName: "sample.parquet",
      contentType: "application/vnd.apache.parquet",
      sizeBytes: 1024,
    });

    expect(plan.key).toContain(
      "dataset-files/supplier-samples/or_supplier/sa_01J20000000000000000000001/",
    );
    expect(plan.key).toMatch(/\.parquet$/);
    expect(plan.expiresInSeconds).toBe(900);
  });
});
