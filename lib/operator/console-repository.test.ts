import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFixtureOperatorConsoleRepository,
  createOperatorConsoleRepository,
  createPostgresOperatorConsoleRepository,
  getOperatorConsolePostgresSessionFromEnv,
  isOperatorTransitionConflictError,
  resolveOperatorConsoleDataSource,
  type QueryRows,
} from "@/lib/operator/console-repository";

describe("operator console repository", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses fixture data source by default", () => {
    expect(resolveOperatorConsoleDataSource()).toBe("fixture");
    expect(createOperatorConsoleRepository()).toEqual(
      expect.objectContaining({ getSnapshot: expect.any(Function) })
    );
  });

  it("rejects unsupported data source values", () => {
    vi.stubEnv("OPERATOR_CONSOLE_DATA_SOURCE", "magic");

    expect(() => resolveOperatorConsoleDataSource()).toThrow(
      'Unsupported OPERATOR_CONSOLE_DATA_SOURCE "magic". Use "fixture" or "postgres".'
    );
  });

  it("requires an org id for postgres-backed snapshots", () => {
    vi.stubEnv("OPERATOR_CONSOLE_DATA_SOURCE", "postgres");
    vi.stubEnv("OPERATOR_CONSOLE_ORG_ID", "");

    expect(() => getOperatorConsolePostgresSessionFromEnv()).toThrow(
      "OPERATOR_CONSOLE_ORG_ID is required when OPERATOR_CONSOLE_DATA_SOURCE=postgres"
    );
  });

  it("adds the production DB elevation scope when JIT is required", () => {
    vi.stubEnv("OPERATOR_CONSOLE_DATA_SOURCE", "postgres");
    vi.stubEnv("OPERATOR_CONSOLE_ORG_ID", "or_01J2INTERNAL");
    vi.stubEnv("OPERATOR_CONSOLE_OPERATOR_ID", "op_01J2OPS");
    vi.stubEnv("OPERATOR_CONSOLE_SERVICE_ROLE", "true");
    vi.stubEnv("OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION", "true");

    expect(getOperatorConsolePostgresSessionFromEnv()).toEqual({
      orgId: "or_01J2INTERNAL",
      operatorId: "op_01J2OPS",
      serviceRole: true,
      elevationScope: "production_db",
    });
  });

  it("maps postgres rows into the console snapshot shape", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("module_counts")) {
        return [
          { key: "builds", total_records: 2, blocked_records: 1 },
          { key: "audit", total_records: 4, blocked_records: 0 },
        ];
      }

      if (sql.includes("work_items")) {
        return [
          {
            module_key: "builds",
            record_type: "build",
            id: "bd_01J2RECEIPTS",
            title: "Iberian retail receipts v3",
            state: "qa",
            detail: "Q-score 0.91",
            updated_at: "2026-05-10T13:20:00.000Z",
            severity: "warning",
            next_action: "Open build detail",
          },
        ];
      }

      if (sql.includes("FROM build b")) {
        return [
          {
            id: "bd_01J2RECEIPTS",
            title: "Iberian retail receipts v3",
            buyer_brief_id: "br_01J2BUYEU",
            supplier_org_id: "so_77RETAIL",
            state: "qa",
            eta: "21 May",
            q_score: 0.91,
            cost_used_usd: 1840,
            budget_usd: 2500,
            gates: [
              { key: "G-1", state: "pass" },
              { key: "G-7", state: "review" },
            ],
          },
        ];
      }

      if (sql.includes("FROM audit_event")) {
        return [
          {
            id: "ae_01STATE",
            actor: "ops@caudals.com",
            action: "state_transition",
            target: "build/bd_01J2RECEIPTS",
            created_at: "2026-05-10T13:08:00.000Z",
          },
        ];
      }

      if (sql.includes("FROM lineage_event")) {
        return [
          {
            id: "le_01",
            namespace: "marquez/caudals",
            job_name: "qa.scorecard.v2",
            dataset_version_id: "dv_01",
            emitted_at: "2026-05-10T13:05:00.000Z",
          },
        ];
      }

      if (sql.includes("FROM license_clause")) {
        return [
          {
            id: "lc_01",
            permits_train: true,
            permits_finetune: true,
            permits_eval: true,
            permits_inference_commercial: false,
            permits_redistribute: false,
            exclusivity: "none",
            geo: ["EU"],
            term_starts_at: null,
            term_ends_at: null,
            share_alike: false,
          },
        ];
      }

      return [];
    });

    const repository = createPostgresOperatorConsoleRepository(
      { orgId: "or_01J2INTERNAL", operatorId: "op_01J2OPS" },
      query as unknown as QueryRows
    );
    const snapshot = await repository.getSnapshot();

    expect(snapshot.builds).toHaveLength(1);
    expect(snapshot.featuredBuild.id).toBe("bd_01J2RECEIPTS");
    expect(snapshot.featuredBuild.gates.find((gate) => gate.key === "G-7")).toMatchObject({
      state: "review",
    });
    expect(snapshot.modules.find((module) => module.key === "builds")).toMatchObject({
      totalRecords: 2,
      blockedRecords: 1,
    });
    expect(snapshot.workItems.builds).toEqual([
      {
        moduleKey: "builds",
        recordType: "build",
        id: "bd_01J2RECEIPTS",
        title: "Iberian retail receipts v3",
        state: "qa",
        detail: "Q-score 0.91",
        updatedAt: "2026-05-10T13:20:00.000Z",
        severity: "warning",
        nextAction: "Open build detail",
      },
    ]);
    expect(snapshot.licensePreview.requestedUseAllowed).toBe(false);
    expect(query).toHaveBeenCalledTimes(6);
  });

  it("keeps fixture repository available for explicit migration mode", async () => {
    const snapshot = await createFixtureOperatorConsoleRepository().getSnapshot();

    expect(snapshot.builds).toHaveLength(5);
    expect(snapshot.modules).toHaveLength(13);
    expect(snapshot.workItems.builds).toHaveLength(1);
  });

  it("returns non-durable audit payloads in fixture mode", async () => {
    const repository = createFixtureOperatorConsoleRepository();

    await expect(
      repository.persistTransition({
        workflow: "build",
        targetId: "bd_01J2RECEIPTS",
        fromState: "qa",
        toState: "packaging",
        reason: "QA scorecard approved",
      })
    ).resolves.toEqual({
      auditEvent: {
        action: "state_transition",
        target_type: "build",
        target_id: "bd_01J2RECEIPTS",
        metadata: {
          from_state: "qa",
          to_state: "packaging",
          reason: "QA scorecard approved",
        },
      },
      persisted: false,
    });
  });

  it("persists postgres transitions with optimistic state checks and audit rows", async () => {
    const session = { orgId: "or_01J2INTERNAL", operatorId: "op_01J2OPS" };
    const query = vi.fn(async (_sql: string, values = []) => {
      expect(_sql).toContain('UPDATE "build"');
      expect(values[0]).toBe("packaging");
      expect(values[1]).toBe("bd_01J2RECEIPTS");
      expect(values[2]).toBe("qa");
      expect(values[3]).toMatch(/^ae_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(values[4]).toBe("op_01J2OPS");
      expect(values[5]).toBe("build");
      expect(values[6]).toBe("bd_01J2RECEIPTS");
      expect(JSON.parse(values[7] as string)).toEqual({
        from_state: "qa",
        to_state: "packaging",
        reason: "QA scorecard approved",
      });

      return [
        {
          id: "ae_01J2AUDIT000000000000000",
          action: "state_transition",
          target_type: "build",
          target_id: "bd_01J2RECEIPTS",
          metadata: {
            from_state: "qa",
            to_state: "packaging",
            reason: "QA scorecard approved",
          },
          created_at: new Date("2026-05-10T13:20:00.000Z"),
        },
      ];
    });

    const repository = createPostgresOperatorConsoleRepository(
      session,
      query as unknown as QueryRows
    );

    await expect(
      repository.persistTransition({
        workflow: "build",
        targetId: "bd_01J2RECEIPTS",
        fromState: "qa",
        toState: "packaging",
        reason: "QA scorecard approved",
      })
    ).resolves.toEqual({
      auditEvent: {
        action: "state_transition",
        target_type: "build",
        target_id: "bd_01J2RECEIPTS",
        metadata: {
          from_state: "qa",
          to_state: "packaging",
          reason: "QA scorecard approved",
        },
      },
      auditEventId: "ae_01J2AUDIT000000000000000",
      createdAt: "2026-05-10T13:20:00.000Z",
      persisted: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      session
    );
  });

  it("surfaces postgres optimistic transition conflicts", async () => {
    const repository = createPostgresOperatorConsoleRepository(
      { orgId: "or_01J2INTERNAL", operatorId: "op_01J2OPS" },
      vi.fn(async () => []) as unknown as QueryRows
    );

    try {
      await repository.persistTransition({
        workflow: "delivery",
        targetId: "dl_01J2SHIP",
        fromState: "downloaded",
        toState: "accepted",
      });
      throw new Error("Expected transition conflict");
    } catch (error) {
      expect(isOperatorTransitionConflictError(error)).toBe(true);
      expect(error).toMatchObject({
        message:
          "delivery/dl_01J2SHIP was not in expected state downloaded",
      });
    }
  });
});
