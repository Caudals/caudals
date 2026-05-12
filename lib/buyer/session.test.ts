import { describe, expect, it, vi } from "vitest";

import {
  parseBuyerOrganizationMetadata,
  resolveBuyerAccessForAuthUser,
} from "@/lib/buyer/session";

describe("buyer session resolution", () => {
  it("parses only buyer auth organization metadata", () => {
    expect(
      parseBuyerOrganizationMetadata(
        JSON.stringify({
          surface: "buyer",
          domainOrgId: "or_buyer",
          tenantOrgId: "or_tenant",
        }),
      ),
    ).toEqual({
      surface: "buyer",
      domainOrgId: "or_buyer",
      tenantOrgId: "or_tenant",
    });

    expect(parseBuyerOrganizationMetadata({ surface: "operator" })).toBeNull();
    expect(parseBuyerOrganizationMetadata("not-json")).toBeNull();
  });

  it("resolves buyer members through domain organization metadata", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          memberRole: "buyer_admin",
          authOrganizationId: "ao_buyer",
          authOrganizationName: "Buyer Workspace",
          metadata: JSON.stringify({
            surface: "buyer",
            domainOrgId: "or_buyer",
            tenantOrgId: "or_tenant",
          }),
        },
      ])
      .mockResolvedValueOnce([
        {
          buyerOrgId: "or_buyer",
          displayName: "Buyer Co",
          legalName: "Buyer Company Inc",
          jurisdiction: "US",
          tenantOrgId: "or_tenant",
        },
      ]);

    const session = await resolveBuyerAccessForAuthUser(
      {
        id: "au_buyer",
        email: "buyer@example.com",
        name: "Buyer User",
      },
      query,
    );

    expect(session).toMatchObject({
      buyer: { id: "or_buyer", displayName: "Buyer Co" },
      tenantOrgId: "or_tenant",
      role: "buyer_admin",
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("kind = 'buyer'"),
      ["or_buyer", "or_tenant"],
      { orgId: "or_tenant" },
    );
  });
});
