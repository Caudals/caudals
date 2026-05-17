import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock, requireCurrentOperatorMock, revalidatePathMock } =
  vi.hoisted(() => ({
    queryRowsMock: vi.fn(),
    requireCurrentOperatorMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/operator-session", () => ({
  requireCurrentOperator: requireCurrentOperatorMock,
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

import {
  createOperatorRecord,
  deleteOperatorRecord,
  updateOperatorRecord,
} from "@/lib/actions/operator-record-actions";

const session = {
  authUser: {
    id: "au_01J2AUTH",
    email: "ops@caudals.local",
    name: "Ops",
    twoFactorEnabled: true,
    passkeyCount: 1,
  },
  operator: {
    id: "op_01J2CURRENT",
    email: "ops@caudals.local",
    name: "Ops",
    role: "admin",
    orgId: "or_01J2OPS",
    mfaRequired: true,
    webauthnRequired: true,
  },
};

describe("operator record actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentOperatorMock.mockResolvedValue(session);
    queryRowsMock.mockResolvedValue([
      {
        id: "al_01J2ALERT",
        updated_at: "2026-05-10T15:00:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);
  });

  it("creates audited operator records with the operator RLS session", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "pipeline",
        recordType: "alert",
        title: "Escalate blocked G-4 gate",
        detail: "Privacy review blocked",
        state: "open",
      })
    ).resolves.toMatchObject({
      ok: true,
      auditEventId: "ae_01J2AUDIT",
      record: {
        moduleKey: "pipeline",
        recordType: "alert",
        title: "Escalate blocked G-4 gate",
        state: "open",
      },
    });

    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^al_/),
        "or_01J2OPS",
        "Escalate blocked G-4 gate",
        "open",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "alert",
        "Escalate blocked G-4 gate",
        "Privacy review blocked",
        "open",
        "{}",
      ],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: false,
      }
    );
  });

  it("creates module-scoped organization records with the operator RLS session", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "or_01J2SUPPLIER",
        updated_at: "2026-05-10T15:05:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "suppliers",
        recordType: "organization",
        title: "Supplier Data Cooperative",
        detail: "https://supplier.example",
        state: "active",
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "or_01J2SUPPLIER",
        moduleKey: "suppliers",
        recordType: "organization",
        title: "Supplier Data Cooperative",
        state: "active",
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("WHEN $12 = 'suppliers' THEN 'supplier'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^or_/),
        "or_01J2OPS",
        "Supplier Data Cooperative",
        "active",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "organization",
        "Supplier Data Cooperative",
        "https://supplier.example",
        "active",
        "{}",
        "suppliers",
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates supplier assets with declared metadata fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "sa_01J2ASSET",
        updated_at: "2026-05-10T15:06:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "suppliers",
        recordType: "supplier_asset",
        title: "Retail receipts 2025 sample",
        detail: "Owned POS data, no third-party enrichment.",
        state: "declared",
        fields: {
          modality: "TEXT",
          declaredVolume: "12M rows, monthly refresh",
          refreshPolicy: "Scheduled",
          sensitivity: "PII",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "sa_01J2ASSET",
        moduleKey: "suppliers",
        recordType: "supplier_asset",
        fields: {
          modality: "text",
          declaredVolume: "12M rows, monthly refresh",
          refreshPolicy: "scheduled",
          sensitivity: "pii",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("$11::jsonb ->> 'modality'");
    expect(createSql).toContain("$11::jsonb ->> 'declaredVolume'");
    expect(createSql).toContain("$11::jsonb ->> 'refreshPolicy'");
    expect(createSql).toContain("$11::jsonb ->> 'sensitivity'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^sa_/),
        "or_01J2OPS",
        "Retail receipts 2025 sample",
        "declared",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "supplier_asset",
        "Retail receipts 2025 sample",
        "Owned POS data, no third-party enrichment.",
        "declared",
        JSON.stringify({
          modality: "text",
          declaredVolume: "12M rows, monthly refresh",
          refreshPolicy: "scheduled",
          sensitivity: "pii",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates buyer opportunities with scoping fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "bo_01J2BUYER",
        updated_at: "2026-05-10T15:08:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "leads",
        recordType: "buyer_opportunity",
        title: "Fraud model evaluation dataset",
        detail: "Buyer needs EU transaction samples.",
        state: "scoping",
        fields: {
          modality: "Mixed",
          budgetRange: "EUR 25k-50k",
          timeline: "Pilot in 30 days",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "bo_01J2BUYER",
        moduleKey: "leads",
        recordType: "buyer_opportunity",
        fields: {
          modality: "mixed",
          budgetRange: "EUR 25k-50k",
          timeline: "Pilot in 30 days",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("$11::jsonb ->> 'modality'");
    expect(createSql).toContain("$11::jsonb ->> 'budgetRange'");
    expect(createSql).toContain("$11::jsonb ->> 'timeline'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^bo_/),
        "or_01J2OPS",
        "Fraud model evaluation dataset",
        "scoping",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "buyer_opportunity",
        "Fraud model evaluation dataset",
        "Buyer needs EU transaction samples.",
        "scoping",
        JSON.stringify({
          modality: "mixed",
          budgetRange: "EUR 25k-50k",
          timeline: "Pilot in 30 days",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates cost entries against build cost envelopes", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "ce_01J2COST",
        created_at: "2026-05-10T15:09:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "operations",
        recordType: "cost_entry",
        title: "llm_enrichment",
        detail: "Expanded prompt review batch.",
        state: "USD",
        fields: {
          buildId: "bd_01J2BUILD",
          costBucket: "LLM",
          amountCents: "26000",
          metadataSummary: "Expanded prompt review batch.",
          overrideReason: "Buyer approved extra enrichment pass",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "ce_01J2COST",
        moduleKey: "operations",
        recordType: "cost_entry",
        fields: {
          buildId: "bd_01J2BUILD",
          costBucket: "llm",
          amountCents: "26000",
          overrideReason: "Buyer approved extra enrichment pass",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    const values = queryRowsMock.mock.calls[0]?.[1];
    expect(createSql).toContain("target_build");
    expect(createSql).toContain("INSERT INTO cost_entry");
    expect(createSql).toContain("$11::jsonb ->> 'costBucket'");
    expect(createSql).toContain("$11::jsonb ->> 'overrideReason'");
    expect(values?.[10]).toBe(
      JSON.stringify({
        buildId: "bd_01J2BUILD",
        costBucket: "llm",
        amountCents: "26000",
        metadataSummary: "Expanded prompt review batch.",
        overrideReason: "Buyer approved extra enrichment pass",
      })
    );
  });

  it("creates routed escalation cases with normalized runbook fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "ec_01J2ESCALATION",
        updated_at: "2026-05-10T15:10:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "escalations",
        recordType: "escalation_case",
        title: "Supplier delivery failure - retail receipts sample",
        detail: "Supplier sample delivery is late and the buyer pilot date is at risk.",
        state: "open",
        fields: {
          escalationKind: "Supplier_Delivery_Failure",
          severity: "CRITICAL",
          sourceRecordType: "Delivery",
          sourceRecordId: "dl_01J2DELIVERY",
          runbookKey: "r-05",
          routedTo: "Supplier_Operations",
          slaDueAt: "2026-05-13T17:00:00Z",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "ec_01J2ESCALATION",
        moduleKey: "escalations",
        recordType: "escalation_case",
        severity: "critical",
        fields: {
          escalationKind: "supplier_delivery_failure",
          severity: "critical",
          sourceRecordType: "delivery",
          sourceRecordId: "dl_01J2DELIVERY",
          runbookKey: "R-05",
          routedTo: "supplier_operations",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    const values = queryRowsMock.mock.calls[0]?.[1];
    expect(createSql).toContain("INSERT INTO escalation_case");
    expect(createSql).toContain("$11::jsonb ->> 'escalationKind'");
    expect(createSql).toContain("$11::jsonb ->> 'runbookKey'");
    expect(values?.[0]).toEqual(expect.stringMatching(/^ec_/));
    expect(values?.[10]).toBe(
      JSON.stringify({
        escalationKind: "supplier_delivery_failure",
        severity: "critical",
        sourceRecordType: "delivery",
        sourceRecordId: "dl_01J2DELIVERY",
        runbookKey: "R-05",
        routedTo: "supplier_operations",
        slaDueAt: "2026-05-13T17:00:00Z",
      })
    );
  });

  it("updates records with optimistic conflict detection", async () => {
    await expect(
      updateOperatorRecord({
        moduleKey: "builds",
        recordType: "build",
        targetId: "bd_01J2BUILD",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "Retail receipts v4",
        detail: "Rework duplicate clusters",
        state: "rework",
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "al_01J2ALERT",
        moduleKey: "builds",
        recordType: "build",
        state: "rework",
      },
    });

    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.updated"),
      [
        "bd_01J2BUILD",
        "or_01J2OPS",
        "Retail receipts v4",
        "rework",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "2026-05-10T15:00:00.000Z",
        "Rework duplicate clusters",
        "build",
        "{}",
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
    const updateSql = queryRowsMock.mock.calls[0]?.[0];
    expect(updateSql).toContain(
      "date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz)"
    );
    expect(updateSql).toContain("'detail', $8::text");
    expect(updateSql).toContain("'expected_updated_at', $7::text");
  });

  it("updates contract fields through audited optimistic writes", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "ct_01J2CONTRACT",
        updated_at: "2026-05-10T15:09:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "suppliers",
        recordType: "contract",
        targetId: "ct_01J2CONTRACT",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "Supplier MSA",
        detail: "s3://contracts/supplier-msa.pdf",
        state: "active",
        fields: {
          contractType: "msa",
          documentUri: "s3://contracts/supplier-msa.pdf",
          signedAt: "2026-05-10T12:00:00Z",
          startsAt: "2026-05-11T00:00:00Z",
          endsAt: "2027-05-11T00:00:00Z",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "ct_01J2CONTRACT",
        recordType: "contract",
        fields: {
          contractType: "msa",
          documentUri: "s3://contracts/supplier-msa.pdf",
          signedAt: "2026-05-10T12:00:00Z",
        },
      },
    });

    const updateSql = queryRowsMock.mock.calls[0]?.[0];
    expect(updateSql).toContain("contract_type = COALESCE");
    expect(updateSql).toContain("$10::jsonb ->> 'signedAt'");
    expect(updateSql).toContain("$10::jsonb ->> 'endsAt'");
  });

  it("updates license clauses with composed permission fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "lc_01J2LICENSE",
        updated_at: "2026-05-10T15:09:30.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "privacy",
        recordType: "license_clause",
        targetId: "lc_01J2LICENSE",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "EU training permit",
        detail: "No redistribution.",
        state: "active",
        fields: {
          permittedUses: "train, eval, commercial_inference",
          geo: "eu, ww",
          exclusivity: "category",
          termEndsAt: "2027-06-01T00:00:00Z",
          shareAlike: "true",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "lc_01J2LICENSE",
        recordType: "license_clause",
        fields: {
          permittedUses: "train, eval, commercial_inference",
          geo: "EU, WW",
          exclusivity: "category",
          shareAlike: "true",
        },
      },
    });

    const updateSql = queryRowsMock.mock.calls[0]?.[0];
    expect(updateSql).toContain("permits_train = CASE");
    expect(updateSql).toContain("permits_inference_commercial");
    expect(updateSql).toContain("regexp_split_to_table");
    expect(updateSql).toContain("$10::jsonb ->> 'shareAlike'");
  });

  it("updates build and run operational fields", async () => {
    queryRowsMock
      .mockResolvedValueOnce([
        {
          id: "bd_01J2BUILD",
          updated_at: "2026-05-10T15:10:00.000Z",
          audit_event_id: "ae_01J2AUDIT1",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "rn_01J2RUN",
          updated_at: "2026-05-10T15:11:00.000Z",
          audit_event_id: "ae_01J2AUDIT2",
        },
      ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "builds",
        recordType: "build",
        targetId: "bd_01J2BUILD",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "Retail receipts v4",
        detail: "Ready for packaging.",
        state: "packaging",
        fields: {
          etaAt: "2026-05-31T09:00:00Z",
          qScore: "0.912",
          costBudgetCents: "250000",
          llmBudgetCents: "25000",
          externalApiBudgetCents: "15000",
          costUsedCents: "184000",
          costOverrideReason: "Buyer approved expanded geocoding pass.",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "bd_01J2BUILD",
        recordType: "build",
        fields: {
          qScore: "0.912",
          costBudgetCents: "250000",
          llmBudgetCents: "25000",
          externalApiBudgetCents: "15000",
          costUsedCents: "184000",
          costOverrideReason: "Buyer approved expanded geocoding pass.",
        },
      },
    });

    await expect(
      updateOperatorRecord({
        moduleKey: "operations",
        recordType: "run",
        targetId: "rn_01J2RUN",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "dagster/run/receipts-v4",
        detail: "Retry completed.",
        state: "succeeded",
        fields: {
          externalRunId: "dagster/run/receipts-v4",
          retryCount: "2",
          startedAt: "2026-05-10T14:00:00Z",
          finishedAt: "2026-05-10T14:45:00Z",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "rn_01J2RUN",
        recordType: "run",
        fields: {
          externalRunId: "dagster/run/receipts-v4",
          retryCount: "2",
        },
      },
    });

    const buildSql = queryRowsMock.mock.calls[0]?.[0];
    const runSql = queryRowsMock.mock.calls[1]?.[0];
    expect(buildSql).toContain("$10::jsonb ->> 'etaAt'");
    expect(buildSql).toContain("$10::jsonb ->> 'costBudgetCents'");
    expect(buildSql).toContain("$10::jsonb ->> 'llmBudgetCents'");
    expect(buildSql).toContain("$10::jsonb ->> 'externalApiBudgetCents'");
    expect(buildSql).toContain("$10::jsonb ->> 'costOverrideReason'");
    expect(runSql).toContain("$10::jsonb ->> 'externalRunId'");
    expect(runSql).toContain("$10::jsonb ->> 'retryCount'");
    expect(runSql).toContain("$10::jsonb ->> 'finishedAt'");
  });

  it("updates build plans and deliveries with structured fields", async () => {
    queryRowsMock
      .mockResolvedValueOnce([
        {
          id: "bp_01J2PLAN",
          updated_at: "2026-05-10T15:12:00.000Z",
          audit_event_id: "ae_01J2AUDIT1",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "dl_01J2DELIVERY",
          updated_at: "2026-05-10T15:13:00.000Z",
          audit_event_id: "ae_01J2AUDIT2",
        },
      ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "builds",
        recordType: "build_plan",
        targetId: "bp_01J2PLAN",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "Plan for retail receipts v4",
        detail: "version: operator-created",
        state: "approved",
        fields: {
          licenseBlocked: "false",
          permitSummary: "Training and evaluation allowed.",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "bp_01J2PLAN",
        recordType: "build_plan",
        fields: {
          licenseBlocked: "false",
          permitSummary: "Training and evaluation allowed.",
        },
      },
    });

    await expect(
      updateOperatorRecord({
        moduleKey: "buyers",
        recordType: "delivery",
        targetId: "dl_01J2DELIVERY",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "S3 delivery",
        detail: "Buyer notified.",
        state: "sent",
        fields: {
          channel: "s3_share",
          receiptHash: "sha256:abc123",
          acceptanceWindowDays: "14",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "dl_01J2DELIVERY",
        recordType: "delivery",
        fields: {
          channel: "s3_share",
          receiptHash: "sha256:abc123",
          acceptanceWindowDays: "14",
        },
      },
    });

    const planSql = queryRowsMock.mock.calls[0]?.[0];
    const deliverySql = queryRowsMock.mock.calls[1]?.[0];
    expect(planSql).toContain("$10::jsonb ->> 'licenseBlocked'");
    expect(planSql).toContain("$10::jsonb ->> 'permitSummary'");
    expect(deliverySql).toContain("$10::jsonb ->> 'channel'");
    expect(deliverySql).toContain("$10::jsonb ->> 'receiptHash'");
    expect(deliverySql).toContain("$10::jsonb ->> 'acceptanceWindowDays'");
  });

  it("creates label batches with validated queue metrics", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "lb_01J2LABEL",
        updated_at: "2026-05-10T15:10:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "labeling",
        recordType: "label_batch",
        title: "Receipt line-item labeling",
        detail: "Escalate low agreement categories.",
        state: "queued",
        fields: {
          queueDepth: "48",
          agreementScore: "0.875",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "lb_01J2LABEL",
        moduleKey: "labeling",
        recordType: "label_batch",
        fields: {
          queueDepth: "48",
          agreementScore: "0.875",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("queue_depth, agreement_score");
    expect(createSql).toContain("$11::jsonb ->> 'queueDepth'");
    expect(createSql).toContain("$11::jsonb ->> 'agreementScore'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^lb_/),
        "or_01J2OPS",
        "Receipt line-item labeling",
        "queued",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "label_batch",
        "Receipt line-item labeling",
        "Escalate low agreement categories.",
        "queued",
        JSON.stringify({
          queueDepth: "48",
          agreementScore: "0.875",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates reviewers with pool and access policy fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "rv_01J2REVIEWER",
        updated_at: "2026-05-10T15:11:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "labeling",
        recordType: "reviewer",
        title: "Ana Lopez",
        detail: "EU-only adjudication with no-download review UI.",
        state: "active",
        fields: {
          reviewerPool: "Subject_Matter_Expert",
          skills: "Document_OCR, Spanish, adjudication",
          accessPolicy: "No_Download, Watermark",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "rv_01J2REVIEWER",
        moduleKey: "labeling",
        recordType: "reviewer",
        fields: {
          reviewerPool: "subject_matter_expert",
          skills: "document_ocr, spanish, adjudication",
          accessPolicy: "no_download, watermark",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO reviewer");
    expect(createSql).toContain("$11::jsonb ->> 'reviewerPool'");
    expect(createSql).toContain("$11::jsonb ->> 'accessPolicy'");
  });

  it("updates QA report scores without replacing the dimensions summary", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "qr_01J2QA",
        updated_at: "2026-05-10T15:12:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "quality",
        recordType: "qa_report",
        targetId: "qr_01J2QA",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "G-7 QA scorecard",
        detail: "Completeness 0.99, privacy 1.00.",
        state: "pass",
        fields: {
          compositeScore: "0.942",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "qr_01J2QA",
        moduleKey: "quality",
        recordType: "qa_report",
        fields: {
          compositeScore: "0.942",
        },
      },
    });

    const updateSql = queryRowsMock.mock.calls[0]?.[0];
    expect(updateSql).toContain("composite_score = COALESCE");
    expect(updateSql).toContain("$10::jsonb ->> 'compositeScore'");
    expect(updateSql).toContain("'fields', $10::jsonb");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.updated"),
      [
        "qr_01J2QA",
        "or_01J2OPS",
        "G-7 QA scorecard",
        "pass",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "2026-05-10T15:00:00.000Z",
        "Completeness 0.99, privacy 1.00.",
        "qa_report",
        JSON.stringify({
          compositeScore: "0.942",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates commercial quotes with validated amount fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "qt_01J2QUOTE",
        updated_at: "2026-05-10T15:14:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "commercials",
        recordType: "quote",
        title: "Pilot quote for Acme",
        detail: "30-day evaluation.",
        state: "draft",
        fields: {
          amountCents: "250000",
          currency: "eur",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "qt_01J2QUOTE",
        moduleKey: "commercials",
        recordType: "quote",
        fields: {
          amountCents: "250000",
          currency: "EUR",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("amount_cents, currency");
    expect(createSql).toContain("$11::jsonb ->> 'amountCents'");
    expect(createSql).toContain("$11::jsonb ->> 'currency'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^qt_/),
        "or_01J2OPS",
        "Pilot quote for Acme",
        "draft",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "quote",
        "Pilot quote for Acme",
        "30-day evaluation.",
        "draft",
        JSON.stringify({
          amountCents: "250000",
          currency: "EUR",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates payments with provider evidence", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "pt_01J2PAYMENT",
        updated_at: "2026-05-10T15:14:20.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "commercials",
        recordType: "payment",
        title: "Pilot payment",
        detail: "pi_123",
        state: "succeeded",
        fields: {
          amountCents: "250000",
          currency: "gbp",
          receiptHash: "sha256:receipt",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "pt_01J2PAYMENT",
        moduleKey: "commercials",
        recordType: "payment",
        fields: {
          amountCents: "250000",
          currency: "GBP",
          receiptHash: "sha256:receipt",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO payment");
    expect(createSql).toContain("target_invoice");
    expect(createSql).toContain("$11::jsonb ->> 'receiptHash'");
  });

  it("creates revenue-share accruals with supplier payout context", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "rs_01J2SHARE",
        updated_at: "2026-05-10T15:14:40.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "commercials",
        recordType: "revenue_share",
        title: "Supplier accrual",
        detail: "Pilot invoice less platform fee.",
        state: "approved",
        fields: {
          shareRate: "0.3",
          grossCents: "250000",
          netCents: "75000",
          currency: "usd",
          basisSummary: "Pilot invoice less platform fee.",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "rs_01J2SHARE",
        moduleKey: "commercials",
        recordType: "revenue_share",
        fields: {
          shareRate: "0.3",
          grossCents: "250000",
          netCents: "75000",
          currency: "USD",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO revenue_share");
    expect(createSql).toContain("target_supplier");
    expect(createSql).toContain("$11::jsonb ->> 'shareRate'");
  });

  it("creates DSAR requests with validated request type and SLA fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "ds_01J2DSAR",
        updated_at: "2026-05-10T15:15:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "privacy",
        recordType: "dsar_request",
        title: "subject_hash_74c",
        detail: "Delete request received through privacy inbox.",
        state: "received",
        fields: {
          requestType: "DELETE",
          slaDays: "30",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "ds_01J2DSAR",
        moduleKey: "privacy",
        recordType: "dsar_request",
        fields: {
          requestType: "delete",
          slaDays: "30",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("$11::jsonb ->> 'requestType'");
    expect(createSql).toContain("$11::jsonb ->> 'slaDays'");
    expect(createSql).toContain("make_interval");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.created"),
      [
        expect.stringMatching(/^ds_/),
        "or_01J2OPS",
        "subject_hash_74c",
        "received",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "dsar_request",
        "subject_hash_74c",
        "Delete request received through privacy inbox.",
        "received",
        JSON.stringify({
          requestType: "delete",
          slaDays: "30",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("updates dataset versions with package metrics", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "dv_01J2VERSION",
        updated_at: "2026-05-10T15:16:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "datasets",
        recordType: "dataset_version",
        targetId: "dv_01J2VERSION",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "v2026.05",
        detail: "s3://datasets/receipts/v2026.05/manifest.json",
        state: "released",
        fields: {
          contentHash: "sha256:abc123",
          recordCount: "1250000",
          sizeBytes: "536870912",
          qaScore: "0.944",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "dv_01J2VERSION",
        moduleKey: "datasets",
        recordType: "dataset_version",
        fields: {
          contentHash: "sha256:abc123",
          recordCount: "1250000",
          sizeBytes: "536870912",
          qaScore: "0.944",
        },
      },
    });

    const updateSql = queryRowsMock.mock.calls[0]?.[0];
    expect(updateSql).toContain("manifest_uri = COALESCE");
    expect(updateSql).toContain("$10::jsonb ->> 'contentHash'");
    expect(updateSql).toContain("$10::jsonb ->> 'recordCount'");
    expect(updateSql).toContain("$10::jsonb ->> 'sizeBytes'");
    expect(updateSql).toContain("$10::jsonb ->> 'qaScore'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.updated"),
      [
        "dv_01J2VERSION",
        "or_01J2OPS",
        "v2026.05",
        "released",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "2026-05-10T15:00:00.000Z",
        "s3://datasets/receipts/v2026.05/manifest.json",
        "dataset_version",
        JSON.stringify({
          contentHash: "sha256:abc123",
          recordCount: "1250000",
          sizeBytes: "536870912",
          qaScore: "0.944",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("creates dataset partitions with lakehouse location metadata", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "dp_01J2PARTITION",
        updated_at: "2026-05-10T15:16:20.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "datasets",
        recordType: "dataset_partition",
        title: "bronze/receipts/2026-05",
        detail: "s3://caudals-bronze/receipts/2026-05/raw.parquet",
        state: "sealed",
        fields: {
          layer: "Bronze",
          objectUri: "s3://caudals-bronze/receipts/2026-05/raw.parquet",
          contentHash: "sha256:partition",
          format: "Parquet",
          recordCount: "1250000",
          sizeBytes: "536870912",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "dp_01J2PARTITION",
        moduleKey: "datasets",
        recordType: "dataset_partition",
        fields: {
          layer: "bronze",
          format: "parquet",
          recordCount: "1250000",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO dataset_partition");
    expect(createSql).toContain("target_version");
    expect(createSql).toContain("$11::jsonb ->> 'objectUri'");
  });

  it("creates manifest artifacts for release evidence", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "ma_01J2MANIFEST",
        updated_at: "2026-05-10T15:16:40.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "datasets",
        recordType: "manifest_artifact",
        title: "Retail receipts Croissant manifest",
        detail: "s3://datasets/receipts/v2026.05/croissant.jsonld",
        state: "approved",
        fields: {
          artifactType: "Croissant",
          artifactUri: "s3://datasets/receipts/v2026.05/croissant.jsonld",
          contentHash: "sha256:croissant",
          metadataSummary: "Generated by packaging job caudals_reference_build.",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "ma_01J2MANIFEST",
        moduleKey: "datasets",
        recordType: "manifest_artifact",
        fields: {
          artifactType: "croissant",
          artifactUri: "s3://datasets/receipts/v2026.05/croissant.jsonld",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO manifest_artifact");
    expect(createSql).toContain("$11::jsonb ->> 'artifactType'");
    expect(createSql).toContain("$11::jsonb ->> 'metadataSummary'");
  });

  it("creates modality contracts with document and time-series contract fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "mc_01J2MODALITY",
        updated_at: "2026-05-10T15:17:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "datasets",
        recordType: "modality_contract",
        title: "Document extraction contract",
        detail: "Parquet page records plus original PDF references",
        state: "review",
        fields: {
          modality: "Document",
          canonicalFormat: "Parquet page records plus original PDF references",
          profileSignals: "page_count, ocr_confidence",
          cleaningOperators: "ocr_normalize, table_extract",
          privacyTreatments: "signature_redaction, printed_pii_redaction",
          labelingWidgets: "page_region, field_extraction",
          qaDimensions: "layout_fidelity, redaction_residual",
          packagingTargets: "page_parquet, pdf_bundle",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "mc_01J2MODALITY",
        moduleKey: "datasets",
        recordType: "modality_contract",
        fields: {
          modality: "document",
          packagingTargets: "page_parquet, pdf_bundle",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO modality_contract");
    expect(createSql).toContain("'document'");
    expect(createSql).toContain("'timeseries'");
    expect(createSql).toContain("$11::jsonb ->> 'profileSignals'");
    expect(createSql).toContain("$11::jsonb ->> 'packagingTargets'");
  });

  it("creates enrichment manifests with reproducibility and license fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "em_01J2ENRICH",
        updated_at: "2026-05-10T15:17:30.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "quality",
        recordType: "enrichment_manifest",
        title: "G-5 H3 enrichment",
        detail: "H3 bins from silver-layer coordinates.",
        state: "review",
        fields: {
          enrichmentClass: "Geospatial",
          addedColumns: "h3_cell, admin_region",
          sources: "OSM boundaries 2026.05",
          sourceLicense: "ODbL-1.0",
          sourceVersion: "2026.05",
          computationMethod: "h3 v4 resolution 8",
          reproducerUri: "s3://manifests/enrichment/h3.json",
          spotCheckRate: "0.1",
          independencePassed: "true",
          licenseCompatible: "true",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "em_01J2ENRICH",
        moduleKey: "quality",
        recordType: "enrichment_manifest",
        fields: {
          enrichmentClass: "geospatial",
          spotCheckRate: "0.1",
          independencePassed: "true",
          licenseCompatible: "true",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO enrichment_manifest");
    expect(createSql).toContain("$11::jsonb ->> 'addedColumns'");
    expect(createSql).toContain("$11::jsonb ->> 'sourceLicense'");
    expect(createSql).toContain("$11::jsonb ->> 'licenseCompatible'");
  });

  it("rejects enrichment manifests without source, license, and method evidence", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "quality",
        recordType: "enrichment_manifest",
        title: "Weak enrichment",
        detail: "Operator note only.",
        state: "review",
        fields: {
          enrichmentClass: "geospatial",
          addedColumns: "h3_cell",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error:
        "Enrichment manifest requires Sources, Source license, Computation method.",
    });

    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("rejects approved enrichment manifests without approval evidence", async () => {
    await expect(
      updateOperatorRecord({
        moduleKey: "quality",
        recordType: "enrichment_manifest",
        targetId: "em_01J2ENRICH",
        title: "G-5 H3 enrichment",
        detail: "H3 bins from silver-layer coordinates.",
        state: "approved",
        fields: {
          enrichmentClass: "geospatial",
          addedColumns: "h3_cell",
          sources: "OSM boundaries",
          sourceLicense: "ODbL-1.0",
          computationMethod: "h3 v4 resolution 8",
          independencePassed: "false",
          licenseCompatible: "true",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error:
        "Enrichment manifest is missing approval evidence: independence_test.",
    });

    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("creates active-learning loops with sampling and routing evidence", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "ll_01J2ACTIVE",
        updated_at: "2026-05-10T15:18:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "labeling",
        recordType: "active_learning_loop",
        title: "Crop imagery loop",
        detail: "Uncertainty and diversity samples for reviewer pass.",
        state: "queued",
        fields: {
          strategy: "FiftyOne_Brain",
          candidateSourceUri: "s3://silver/candidates/crop-v1.jsonl",
          embeddingIndexUri: "s3://indexes/fiftyone-brain/crop-v1",
          modelSnapshotUri: "s3://models/crop-assistant-v2",
          uncertaintyMetric: "Entropy",
          diversityMetric: "Brain_similarity",
          boundaryMetric: "Margin",
          targetSampleSize: "128",
          selectedCount: "96",
          selectionManifestUri:
            "s3://manifests/active-learning/crop-loop-v1.json",
          reviewerRouting: "cv_specialists:priority_high",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "ll_01J2ACTIVE",
        moduleKey: "labeling",
        recordType: "active_learning_loop",
        fields: {
          strategy: "fiftyone_brain",
          targetSampleSize: "128",
          selectedCount: "96",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO active_learning_loop");
    expect(createSql).toContain("$11::jsonb ->> 'embeddingIndexUri'");
    expect(createSql).toContain("$11::jsonb ->> 'reviewerRouting'");
  });

  it("rejects queued active-learning loops without reviewer routing evidence", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "labeling",
        recordType: "active_learning_loop",
        title: "Weak active loop",
        detail: "Missing manifest and reviewer routing.",
        state: "queued",
        fields: {
          strategy: "hybrid_uncertainty_diversity",
          candidateSourceUri: "s3://silver/candidates.jsonl",
          embeddingIndexUri: "s3://indexes/lightly.lance",
          modelSnapshotUri: "s3://models/assistant",
          uncertaintyMetric: "entropy",
          diversityMetric: "embedding_distance",
          boundaryMetric: "margin",
          targetSampleSize: "64",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error:
        "Active-learning loop is missing routing evidence: selected_count, selection_manifest_uri, reviewer_routing.",
    });

    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("creates Cleanlab QA passes with scan and requeue evidence", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "cq_01J2CLEANLAB",
        updated_at: "2026-05-10T15:20:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "quality",
        recordType: "cleanlab_qa_pass",
        title: "Receipt OCR Cleanlab pass",
        detail: "Three suspected label errors routed back to reviewers.",
        state: "requeue",
        fields: {
          scanStrategy: "Confident_Learning",
          inputManifestUri: "s3://silver/labels/receipt-pass-1.jsonl",
          cleanlabReportUri: "s3://qa/cleanlab/receipt-report.json",
          modelSnapshotUri: "s3://models/receipt-label-error-detector",
          scannedCount: "128",
          suspectedLabelErrors: "3",
          estimatedErrorRate: "0.02344",
          errorRateThreshold: "0.03",
          requeueCount: "3",
          requeueManifestUri: "s3://qa/cleanlab/receipt-requeue.jsonl",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "cq_01J2CLEANLAB",
        moduleKey: "quality",
        recordType: "cleanlab_qa_pass",
        fields: {
          scanStrategy: "confident_learning",
          scannedCount: "128",
          estimatedErrorRate: "0.02344",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO cleanlab_qa_pass");
    expect(createSql).toContain("$11::jsonb ->> 'cleanlabReportUri'");
    expect(createSql).toContain("target_report");
  });

  it("rejects accepted Cleanlab QA passes above the error threshold", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "quality",
        recordType: "cleanlab_qa_pass",
        title: "Weak Cleanlab pass",
        detail: "Error rate remains too high.",
        state: "accepted",
        fields: {
          scanStrategy: "confident_learning",
          inputManifestUri: "s3://silver/labels.jsonl",
          cleanlabReportUri: "s3://qa/cleanlab/report.json",
          modelSnapshotUri: "s3://models/label-error",
          scannedCount: "100",
          suspectedLabelErrors: "8",
          estimatedErrorRate: "0.08",
          errorRateThreshold: "0.03",
          requeueCount: "8",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error:
        "Cleanlab QA pass is missing scan evidence: error_rate_threshold_pass.",
    });

    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("creates subscriptions with recurring delivery evidence", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "su_01J2SUBSCRIPTION",
        updated_at: "2026-05-10T15:21:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "buyers",
        recordType: "subscription",
        title: "Retail receipts monthly feed",
        detail: "Latest plus three rolling refreshes.",
        state: "active",
        fields: {
          cadence: "Monthly",
          deliveryChannel: "Delta_Share",
          rollingWindowVersions: "3",
          nextRefreshAt: "2026-06-01T09:00:00Z",
          retentionDays: "365",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "su_01J2SUBSCRIPTION",
        moduleKey: "buyers",
        recordType: "subscription",
        fields: {
          cadence: "monthly",
          deliveryChannel: "delta_share",
          rollingWindowVersions: "3",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO subscription");
    expect(createSql).toContain("$11::jsonb ->> 'deliveryChannel'");
    expect(createSql).toContain("target_buyer");
  });

  it("creates delta manifests with per-increment QA, rights, and privacy evidence", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "dm_01J2DELTA",
        updated_at: "2026-05-10T15:22:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      createOperatorRecord({
        moduleKey: "datasets",
        recordType: "delta_manifest",
        title: "Retail receipts May refresh delta",
        detail: "1,302 changed records.",
        state: "published",
        fields: {
          manifestUri: "s3://datasets/receipts/v2026.05/delta.json",
          manifestHash: "sha256:delta",
          previousDatasetVersionId: "dv_01J2PREVIOUS",
          deliveryId: "dl_01J2DELIVERY",
          qaReportId: "qr_01J2QA",
          addedRecords: "1250",
          updatedRecords: "48",
          deletedRecords: "4",
          tombstonedRecords: "0",
          totalRecords: "51221",
          qualityScore: "0.944",
          rightsReverified: "TRUE",
          privacyVerified: "true",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "dm_01J2DELTA",
        moduleKey: "datasets",
        recordType: "delta_manifest",
        fields: {
          manifestHash: "sha256:delta",
          qualityScore: "0.944",
          rightsReverified: "true",
          privacyVerified: "true",
        },
      },
    });

    const createSql = queryRowsMock.mock.calls[0]?.[0];
    expect(createSql).toContain("INSERT INTO delta_manifest");
    expect(createSql).toContain("$11::jsonb ->> 'previousDatasetVersionId'");
    expect(createSql).toContain("$11::jsonb ->> 'rightsReverified'");
  });

  it("rejects published delta manifests without per-increment evidence", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "datasets",
        recordType: "delta_manifest",
        title: "Weak delta",
        detail: "Missing QA and rights evidence.",
        state: "published",
        fields: {
          manifestUri: "s3://datasets/receipts/v2026.05/delta.json",
          manifestHash: "sha256:delta",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error:
        "Delta manifest is missing refresh evidence: previous_dataset_version_id, delivery_id, qa_report_id, quality_score, rights_reverified, privacy_verified.",
    });

    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("updates catalogue listings with structured pricing fields", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "cl_01J2LISTING",
        updated_at: "2026-05-10T15:18:00.000Z",
        audit_event_id: "ae_01J2AUDIT",
      },
    ]);

    await expect(
      updateOperatorRecord({
        moduleKey: "catalogue",
        recordType: "catalogue_listing",
        targetId: "cl_01J2LISTING",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
        title: "Retail receipt OCR dataset",
        detail: "Private offer only until supplier approval.",
        state: "active",
        fields: {
          priceCents: "990000",
          currency: "usd",
          billingModel: "Pilot",
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      record: {
        id: "cl_01J2LISTING",
        moduleKey: "catalogue",
        recordType: "catalogue_listing",
        fields: {
          priceCents: "990000",
          currency: "USD",
          billingModel: "pilot",
        },
      },
    });

    const updateSql = queryRowsMock.mock.calls[0]?.[0];
    expect(updateSql).toContain("$10::jsonb ->> 'priceCents'");
    expect(updateSql).toContain("$10::jsonb ->> 'currency'");
    expect(updateSql).toContain("$10::jsonb ->> 'billingModel'");
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.updated"),
      [
        "cl_01J2LISTING",
        "or_01J2OPS",
        "Retail receipt OCR dataset",
        "active",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "2026-05-10T15:00:00.000Z",
        "Private offer only until supplier approval.",
        "catalogue_listing",
        JSON.stringify({
          priceCents: "990000",
          currency: "USD",
          billingModel: "pilot",
        }),
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
  });

  it("rejects record-specific field values outside the configured range", async () => {
    await expect(
      updateOperatorRecord({
        moduleKey: "quality",
        recordType: "qa_report",
        targetId: "qr_01J2QA",
        title: "G-7 QA scorecard",
        detail: "Completeness 0.99, privacy 1.00.",
        state: "pass",
        fields: {
          compositeScore: "1.25",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Composite score must be between 0 and 1.",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported DSAR request types", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "privacy",
        recordType: "dsar_request",
        title: "subject_hash_74c",
        detail: "Unsupported request type.",
        state: "received",
        fields: {
          requestType: "erase",
          slaDays: "14",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Request type must be one of access, delete, correct, export, restrict.",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported commercial currencies", async () => {
    await expect(
      createOperatorRecord({
        moduleKey: "commercials",
        recordType: "quote",
        title: "Pilot quote for Acme",
        detail: "30-day evaluation.",
        state: "draft",
        fields: {
          amountCents: "250000",
          currency: "AUD",
        },
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Currency must be one of USD, EUR, GBP.",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("soft-deletes records and writes audit events", async () => {
    queryRowsMock.mockResolvedValue([
      {
        id: "bd_01J2BUILD",
        audit_event_id: "ae_01J2DELETE",
      },
    ]);

    await expect(
      deleteOperatorRecord({
        moduleKey: "builds",
        recordType: "build",
        targetId: "bd_01J2BUILD",
        expectedUpdatedAt: "2026-05-10T15:00:00.000Z",
      })
    ).resolves.toEqual({
      ok: true,
      deletedRecordId: "bd_01J2BUILD",
      auditEventId: "ae_01J2DELETE",
    });

    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record.deleted"),
      [
        "bd_01J2BUILD",
        "or_01J2OPS",
        expect.stringMatching(/^ae_/),
        "op_01J2CURRENT",
        "2026-05-10T15:00:00.000Z",
        "build",
      ],
      expect.objectContaining({
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
      })
    );
    const deleteSql = queryRowsMock.mock.calls[0]?.[0];
    expect(deleteSql).toContain(
      "date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $5::timestamptz)"
    );
    expect(deleteSql).toContain(
      "jsonb_build_object('expected_updated_at', $5::text)"
    );
  });

  it("keeps audit events append-only", async () => {
    await expect(
      updateOperatorRecord({
        moduleKey: "audit",
        recordType: "audit_event",
        targetId: "ae_01J2AUDIT",
        title: "Audit edit attempt",
        detail: "",
        state: "operator_manual_marker",
      })
    ).resolves.toMatchObject({
      code: "CONFLICT",
      error: "Audit events are append-only and cannot be edited or deleted.",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });

  it("keeps cost entries append-only after creation", async () => {
    await expect(
      updateOperatorRecord({
        moduleKey: "operations",
        recordType: "cost_entry",
        targetId: "ce_01J2COST",
        title: "GPU reservation",
        detail: "ledger correction attempt",
        state: "USD",
      })
    ).resolves.toMatchObject({
      code: "CONFLICT",
      error: "Cost entries are ledger records and remain append-only.",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });
});
