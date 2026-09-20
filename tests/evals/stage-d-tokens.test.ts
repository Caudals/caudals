import { describe,expect,it } from "vitest";
import { isCustomerTokenUsable,parseCustomerBearer } from "../../lib/evals/monitoring/tokens";

describe("WP-13 customer API tokens",()=>{
  it("requires a bounded bearer and exact scope before expiry",()=>{
    expect(parseCustomerBearer("Bearer evct_"+"a".repeat(43))).toBe("evct_"+"a".repeat(43));
    expect(parseCustomerBearer("Basic xxx")).toBeNull();
    const row={scopes:["runs:read"],expires_at:"2026-09-21T00:00:00Z",revoked_at:null};
    expect(isCustomerTokenUsable(row,"runs:read",Date.parse("2026-09-20T00:00:00Z"))).toBe(true);
    expect(isCustomerTokenUsable(row,"reports:read",Date.parse("2026-09-20T00:00:00Z"))).toBe(false);
    expect(isCustomerTokenUsable(row,"runs:read",Date.parse(row.expires_at))).toBe(false);
    expect(isCustomerTokenUsable({...row,revoked_at:"2026-09-20T00:00:00Z"},"runs:read",Date.parse("2026-09-20T00:00:00Z"))).toBe(false);
  });
});
