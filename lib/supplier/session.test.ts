import { describe, expect, it, vi } from "vitest";
import {
  parseSupplierOrganizationMetadata,
  resolveSupplierAccessForAuthUser,
} from "@/lib/supplier/session";

describe("supplier session resolution", () => {
  it("parses supplier auth organization metadata", () => {
    expect(
      parseSupplierOrganizationMetadata({
        surface: "supplier",
        domainOrgId: "or_supplier",
        tenantOrgId: "or_tenant",
      }),
    ).toEqual({
      surface: "supplier",
      domainOrgId: "or_supplier",
      tenantOrgId: "or_tenant",
    });
    expect(parseSupplierOrganizationMetadata({ surface: "buyer" })).toBeNull();
  });

  it("resolves a supplier member through tenant-scoped organization data", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          memberRole: "supplier_admin",
          authOrganizationId: "ao_supplier",
          authOrganizationName: "Supplier Portal",
          metadata: JSON.stringify({
            surface: "supplier",
            domainOrgId: "or_supplier",
            tenantOrgId: "or_tenant",
          }),
        },
      ])
      .mockResolvedValueOnce([
        {
          supplierOrgId: "or_supplier",
          displayName: "Supplier Co",
          legalName: "Supplier Company SL",
          jurisdiction: "ES",
          tenantOrgId: "or_tenant",
        },
      ]);

    await expect(
      resolveSupplierAccessForAuthUser(
        {
          id: "au_supplier",
          email: "supplier.fixture@caudals.local",
          name: "Supplier Fixture",
        },
        query,
      ),
    ).resolves.toMatchObject({
      supplier: { id: "or_supplier", displayName: "Supplier Co" },
      tenantOrgId: "or_tenant",
      role: "supplier_admin",
    });

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("kind = 'supplier'"),
      ["or_supplier", "or_tenant"],
      { orgId: "or_tenant" },
    );
  });
});
