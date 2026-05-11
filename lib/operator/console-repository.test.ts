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
            field_values: {
              etaAt: "2026-05-31T09:00:00.000Z",
              qScore: 0.912,
              costBudgetCents: 250000,
              costUsedCents: 184000,
            },
          },
          {
            module_key: "suppliers",
            record_type: "contract",
            id: "ct_01J2CONTRACT",
            title: "supplier contract",
            state: "active",
            detail: "s3://contracts/supplier-msa.pdf",
            updated_at: "2026-05-10T13:19:30.000Z",
            severity: "info",
            next_action: "Review contract",
            field_values: {
              contractType: "supplier",
              documentUri: "s3://contracts/supplier-msa.pdf",
              signedAt: "2026-05-10T12:00:00.000Z",
            },
          },
          {
            module_key: "privacy",
            record_type: "license_clause",
            id: "lc_01J2LICENSE",
            title: "License clause",
            state: "active",
            detail: "Training and eval only",
            updated_at: "2026-05-10T13:19:00.000Z",
            severity: "info",
            next_action: "Review license clause",
            field_values: {
              permittedUses: "train, eval",
              geo: "EU, WW",
              exclusivity: "none",
              shareAlike: false,
            },
          },
          {
            module_key: "buyers",
            record_type: "delivery",
            id: "dl_01J2DELIVERY",
            title: "Delivery s3_share",
            state: "sent",
            detail: "dv_01J2VERSION",
            updated_at: "2026-05-10T13:18:30.000Z",
            severity: "info",
            next_action: "Review delivery",
            field_values: {
              channel: "s3_share",
              receiptHash: "sha256:abc123",
              acceptanceWindowDays: 14,
            },
          },
          {
            module_key: "commercials",
            record_type: "quote",
            id: "qt_01J2QUOTE",
            title: "Quote EUR 2500",
            state: "draft",
            detail: "Buyer opportunity",
            updated_at: "2026-05-10T13:18:00.000Z",
            severity: "warning",
            next_action: "Review quote",
            field_values: JSON.stringify({
              amountCents: 250000,
              currency: "EUR",
            }),
          },
          {
            module_key: "datasets",
            record_type: "dataset_version",
            id: "dv_01J2VERSION",
            title: "Iberian retail receipts v2026.05",
            state: "released",
            detail: "1250000 records",
            updated_at: "2026-05-10T13:17:00.000Z",
            severity: "info",
            next_action: "Review dataset version",
            field_values: {
              contentHash: "sha256:abc123",
              recordCount: 1250000,
              sizeBytes: 536870912,
              qaScore: 0.944,
            },
          },
          {
            module_key: "datasets",
            record_type: "modality_contract",
            id: "mc_01J2MODALITY",
            title: "Crop imagery video contract",
            state: "review",
            detail: "Lance index over MP4 chunks",
            updated_at: "2026-05-10T13:16:30.000Z",
            severity: "warning",
            next_action: "Review modality contract",
            field_values: {
              modality: "video",
              canonicalFormat: "Lance index over MP4 chunks",
              packagingTargets: "mp4_clips, per_frame_manifest",
            },
          },
          {
            module_key: "quality",
            record_type: "enrichment_manifest",
            id: "em_01J2ENRICH",
            title: "G-5 H3 enrichment",
            state: "review",
            detail: "geospatial / ODbL-1.0",
            updated_at: "2026-05-10T13:16:15.000Z",
            severity: "warning",
            next_action: "Review enrichment manifest",
            field_values: {
              enrichmentClass: "geospatial",
              addedColumns: "h3_cell, admin_region",
              sourceLicense: "ODbL-1.0",
              licenseCompatible: true,
            },
          },
          {
            module_key: "labeling",
            record_type: "active_learning_loop",
            id: "ll_01J2ACTIVE",
            title: "Crop imagery active loop",
            state: "review",
            detail: "hybrid_uncertainty_diversity / selected 96/128",
            updated_at: "2026-05-10T13:16:05.000Z",
            severity: "warning",
            next_action: "Review active-learning loop",
            field_values: {
              strategy: "hybrid_uncertainty_diversity",
              candidateSourceUri: "s3://silver/candidates/crop-v1.jsonl",
              embeddingIndexUri: "s3://indexes/lightly/crop-v1.lance",
              targetSampleSize: 128,
              selectedCount: 96,
              reviewerRouting: "cv_specialists:priority_high",
            },
          },
          {
            module_key: "privacy",
            record_type: "dsar_request",
            id: "ds_01J2DSAR",
            title: "delete request",
            state: "received",
            detail: "SLA 24 May",
            updated_at: "2026-05-10T13:16:00.000Z",
            severity: "warning",
            next_action: "Review DSAR",
            field_values: {
              requestType: "delete",
              slaDays: 14,
            },
          },
          {
            module_key: "catalogue",
            record_type: "catalogue_listing",
            id: "cl_01J2LISTING",
            title: "Retail receipt OCR dataset",
            state: "active",
            detail: "dt_01J2DATASET",
            updated_at: "2026-05-10T13:15:00.000Z",
            severity: "info",
            next_action: "Review listing",
            field_values: JSON.stringify({
              priceCents: 990000,
              currency: "USD",
              billingModel: "pilot",
            }),
          },
          {
            module_key: "operations",
            record_type: "run",
            id: "rn_01J2RUN",
            title: "dagster/run/receipts-v4",
            state: "succeeded",
            detail: "Retry 2",
            updated_at: "2026-05-10T13:14:00.000Z",
            severity: "info",
            next_action: "Review run",
            field_values: {
              externalRunId: "dagster/run/receipts-v4",
              retryCount: 2,
              startedAt: "2026-05-10T12:00:00.000Z",
              finishedAt: "2026-05-10T12:45:00.000Z",
            },
          },
          {
            module_key: "operations",
            record_type: "cost_entry",
            id: "ce_01J2COST",
            title: "labeling_review cost",
            state: "USD",
            detail: "125",
            updated_at: "2026-05-10T13:13:00.000Z",
            severity: "info",
            next_action: "Review cost entry",
            field_values: {
              amountCents: 12500,
              metadataSummary: "Reviewer batch cost estimate.",
            },
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
        fields: {
          etaAt: "2026-05-31T09:00:00.000Z",
          qScore: "0.912",
          costBudgetCents: "250000",
          costUsedCents: "184000",
        },
      },
    ]);
    expect(snapshot.workItems.suppliers[0]).toMatchObject({
      id: "ct_01J2CONTRACT",
      recordType: "contract",
      fields: {
        contractType: "supplier",
        documentUri: "s3://contracts/supplier-msa.pdf",
      },
    });
    expect(
      snapshot.workItems.privacy.find((item) => item.id === "lc_01J2LICENSE")
    ).toMatchObject({
      recordType: "license_clause",
      fields: {
        permittedUses: "train, eval",
        geo: "EU, WW",
        shareAlike: "false",
      },
    });
    expect(snapshot.workItems.buyers[0]).toMatchObject({
      id: "dl_01J2DELIVERY",
      recordType: "delivery",
      fields: {
        channel: "s3_share",
        receiptHash: "sha256:abc123",
        acceptanceWindowDays: "14",
      },
    });
    expect(snapshot.workItems.commercials[0]).toMatchObject({
      id: "qt_01J2QUOTE",
      recordType: "quote",
      fields: {
        amountCents: "250000",
        currency: "EUR",
      },
    });
    expect(snapshot.workItems.datasets[0]).toMatchObject({
      id: "dv_01J2VERSION",
      recordType: "dataset_version",
      fields: {
        contentHash: "sha256:abc123",
        recordCount: "1250000",
        sizeBytes: "536870912",
        qaScore: "0.944",
      },
    });
    expect(
      snapshot.workItems.datasets.find((item) => item.id === "mc_01J2MODALITY")
    ).toMatchObject({
      recordType: "modality_contract",
      fields: {
        modality: "video",
        canonicalFormat: "Lance index over MP4 chunks",
        packagingTargets: "mp4_clips, per_frame_manifest",
      },
    });
    expect(
      snapshot.workItems.quality.find((item) => item.id === "em_01J2ENRICH")
    ).toMatchObject({
      recordType: "enrichment_manifest",
      fields: {
        enrichmentClass: "geospatial",
        addedColumns: "h3_cell, admin_region",
        sourceLicense: "ODbL-1.0",
        licenseCompatible: "true",
      },
    });
    expect(
      snapshot.workItems.labeling.find((item) => item.id === "ll_01J2ACTIVE")
    ).toMatchObject({
      recordType: "active_learning_loop",
      fields: {
        strategy: "hybrid_uncertainty_diversity",
        targetSampleSize: "128",
        selectedCount: "96",
        reviewerRouting: "cv_specialists:priority_high",
      },
    });
    expect(
      snapshot.workItems.privacy.find((item) => item.id === "ds_01J2DSAR")
    ).toMatchObject({
      recordType: "dsar_request",
      fields: {
        requestType: "delete",
        slaDays: "14",
      },
    });
    expect(
      snapshot.workItems.catalogue.find((item) => item.id === "cl_01J2LISTING")
    ).toMatchObject({
      recordType: "catalogue_listing",
      fields: {
        priceCents: "990000",
        currency: "USD",
        billingModel: "pilot",
      },
    });
    expect(
      snapshot.workItems.operations.find((item) => item.id === "rn_01J2RUN")
    ).toMatchObject({
      recordType: "run",
      fields: {
        externalRunId: "dagster/run/receipts-v4",
        retryCount: "2",
      },
    });
    expect(
      snapshot.workItems.operations.find((item) => item.id === "ce_01J2COST")
    ).toMatchObject({
      recordType: "cost_entry",
      fields: {
        amountCents: "12500",
        metadataSummary: "Reviewer batch cost estimate.",
      },
    });
    expect(snapshot.licensePreview.requestedUseAllowed).toBe(false);
    expect(query).toHaveBeenCalledTimes(6);

    const workItemsSql = query.mock.calls.find(([sql]) =>
      sql.includes("work_items")
    )?.[0];
    expect(workItemsSql).toContain("contractType");
    expect(workItemsSql).toContain("permittedUses");
    expect(workItemsSql).toContain("acceptanceWindowDays");
    expect(workItemsSql).toContain("externalRunId");
    expect(workItemsSql).toContain("modality_contract");
    expect(workItemsSql).toContain("enrichment_manifest");
    expect(workItemsSql).toContain("active_learning_loop");
  });

  it("keeps fixture repository available for explicit migration mode", async () => {
    const snapshot = await createFixtureOperatorConsoleRepository().getSnapshot();

    expect(snapshot.builds).toHaveLength(5);
    expect(snapshot.modules).toHaveLength(14);
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

  it("guards active-learning queue transitions on selected routing evidence", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain('UPDATE "active_learning_loop"');
      expect(sql).toContain("selected_count > 0");
      expect(sql).toContain("selection_manifest_uri");
      expect(sql).toContain("reviewer_routing ? 'policy'");

      return [
        {
          id: "ae_01J2ACTIVEAUDIT",
          action: "state_transition",
          target_type: "active_learning_loop",
          target_id: "ll_01J2ACTIVE",
          metadata: {
            from_state: "review",
            to_state: "queued",
          },
          created_at: "2026-05-10T13:21:00.000Z",
        },
      ];
    });
    const repository = createPostgresOperatorConsoleRepository(
      { orgId: "or_01J2INTERNAL", operatorId: "op_01J2OPS" },
      query as unknown as QueryRows
    );

    await expect(
      repository.persistTransition({
        workflow: "active_learning_loop",
        targetId: "ll_01J2ACTIVE",
        fromState: "review",
        toState: "queued",
      })
    ).resolves.toMatchObject({
      persisted: true,
      auditEvent: {
        target_type: "active_learning_loop",
        metadata: {
          from_state: "review",
          to_state: "queued",
        },
      },
    });
  });
});
