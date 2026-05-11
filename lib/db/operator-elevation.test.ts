import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

import {
  assertActiveOperatorElevation,
  PRODUCTION_DB_ELEVATION_SCOPE,
} from "@/lib/db/operator-elevation";

function createClient(rowCount = 1) {
  return {
    query: vi.fn(async () => ({ rowCount })),
  } as unknown as PoolClient;
}

describe("operator DB elevation", () => {
  it("does not query when no elevation scope is required", async () => {
    const client = createClient();

    await expect(
      assertActiveOperatorElevation(client, {
        orgId: "or_01J2INTERNAL",
        operatorId: "op_01J2OPS",
        serviceRole: true,
      })
    ).resolves.toBeUndefined();

    expect(client.query).not.toHaveBeenCalled();
  });

  it("requires service-role sessions for elevation checks", async () => {
    const client = createClient();

    await expect(
      assertActiveOperatorElevation(client, {
        orgId: "or_01J2INTERNAL",
        operatorId: "op_01J2OPS",
        elevationScope: PRODUCTION_DB_ELEVATION_SCOPE,
      })
    ).rejects.toThrow(
      "Operator DB elevation can only be required for service-role sessions"
    );
  });

  it("requires an operator id for elevation checks", async () => {
    const client = createClient();

    await expect(
      assertActiveOperatorElevation(client, {
        orgId: "or_01J2INTERNAL",
        serviceRole: true,
        elevationScope: PRODUCTION_DB_ELEVATION_SCOPE,
      })
    ).rejects.toThrow(
      "Operator DB elevation requires an authenticated operator id"
    );
  });

  it("accepts an active time-bounded elevation grant", async () => {
    const client = createClient();

    await expect(
      assertActiveOperatorElevation(client, {
        orgId: "or_01J2INTERNAL",
        operatorId: "op_01J2OPS",
        serviceRole: true,
        elevationScope: PRODUCTION_DB_ELEVATION_SCOPE,
      })
    ).resolves.toBeUndefined();

    expect(client.query).toHaveBeenCalledWith(expect.any(String), [
      "or_01J2INTERNAL",
      "op_01J2OPS",
      PRODUCTION_DB_ELEVATION_SCOPE,
    ]);
  });

  it("rejects missing or expired elevation grants", async () => {
    const client = createClient(0);

    await expect(
      assertActiveOperatorElevation(client, {
        orgId: "or_01J2INTERNAL",
        operatorId: "op_01J2OPS",
        serviceRole: true,
        elevationScope: PRODUCTION_DB_ELEVATION_SCOPE,
      })
    ).rejects.toThrow(
      "Active production_db operator elevation is required"
    );
  });
});
