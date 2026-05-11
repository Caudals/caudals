import {
  composeLicenseGrants,
  evaluateRequestedUse,
  type ComposedLicense,
  type LicenseGrant,
} from "@/lib/operator/license-composition";
import {
  createBuildGates,
  getOperatorConsoleSnapshot,
  groupWorkItems,
  operatorModuleSummaries,
  type BuildGate,
  type DemoBuild,
  type GateKey,
  type OperatorConsoleSnapshot,
  type OperatorModuleKey,
  type OperatorWorkItem,
} from "@/lib/operator/console-snapshot";
import { createPrefixedId } from "@/lib/operator/ids";
import {
  buildTransitionAuditEvent,
  workflowDefinitions,
  type TransitionAuditEvent,
  type WorkflowName,
} from "@/lib/operator/workflows";
import { queryRows, type OperatorDbSession, type QueryValue } from "@/lib/db/client";
import { PRODUCTION_DB_ELEVATION_SCOPE } from "@/lib/db/operator-elevation";

export type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession
) => Promise<T[]>;

type ModuleCountRow = {
  key: OperatorModuleKey;
  total_records: number | string;
  blocked_records: number | string;
};

type BuildRow = {
  id: string;
  title: string;
  buyer_brief_id: string | null;
  supplier_org_id: string | null;
  state: string;
  eta: string | null;
  q_score: number | string | null;
  cost_used_usd: number | string | null;
  budget_usd: number | string | null;
  gates: { key: GateKey; state: BuildGate["state"] }[] | string | null;
};

type AuditEventRow = {
  id: string;
  actor: string | null;
  action: string;
  target: string;
  created_at: string | Date;
};

type LineageRow = {
  id: string;
  namespace: string;
  job_name: string;
  dataset_version_id: string | null;
  emitted_at: string | Date;
};

type LicenseClauseRow = {
  id: string;
  permits_train: boolean;
  permits_finetune: boolean;
  permits_eval: boolean;
  permits_inference_commercial: boolean;
  permits_redistribute: boolean;
  exclusivity: "none" | "exclusive" | "category";
  geo: string[];
  term_starts_at: string | Date | null;
  term_ends_at: string | Date | null;
  share_alike: boolean;
};

type WorkItemRow = {
  module_key: OperatorModuleKey;
  record_type: string;
  id: string;
  title: string;
  state: string;
  detail: string | null;
  updated_at: string | Date;
  severity: OperatorWorkItem["severity"];
  next_action: string | null;
  field_values?: Record<string, unknown> | string | null;
};

type PersistTransitionRow = {
  id: string;
  action: "state_transition";
  target_type: WorkflowName;
  target_id: string;
  metadata: TransitionAuditEvent["metadata"] | string;
  created_at: string | Date;
};

export type PersistOperatorTransitionInput = {
  workflow: WorkflowName;
  targetId: string;
  fromState: string;
  toState: string;
  reason?: string;
};

export type PersistOperatorTransitionResult = {
  auditEvent: TransitionAuditEvent;
  auditEventId?: string;
  createdAt?: string;
  persisted: boolean;
};

export type OperatorConsoleRepository = {
  getSnapshot(): Promise<OperatorConsoleSnapshot>;
  persistTransition(
    input: PersistOperatorTransitionInput
  ): Promise<PersistOperatorTransitionResult>;
};

export class OperatorTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorTransitionConflictError";
  }
}

export function isOperatorTransitionConflictError(
  error: unknown
): error is OperatorTransitionConflictError {
  return error instanceof OperatorTransitionConflictError;
}

export function createFixtureOperatorConsoleRepository(): OperatorConsoleRepository {
  return {
    async getSnapshot() {
      return getOperatorConsoleSnapshot();
    },
    async persistTransition(input) {
      return {
        auditEvent: buildTransitionAuditEvent(input),
        persisted: false,
      };
    },
  };
}

export function createPostgresOperatorConsoleRepository(
  session: OperatorDbSession,
  query: QueryRows = queryRows
): OperatorConsoleRepository {
  return {
    async getSnapshot() {
      return getOperatorConsoleSnapshotFromPostgres(session, query);
    },
    async persistTransition(input) {
      return persistOperatorTransitionToPostgres(input, session, query);
    },
  };
}

export function resolveOperatorConsoleDataSource() {
  const value = process.env.OPERATOR_CONSOLE_DATA_SOURCE ?? "fixture";

  if (value !== "fixture" && value !== "postgres") {
    throw new Error(
      `Unsupported OPERATOR_CONSOLE_DATA_SOURCE "${value}". Use "fixture" or "postgres".`
    );
  }

  return value;
}

export function getOperatorConsolePostgresSessionFromEnv(): OperatorDbSession {
  const orgId = process.env.OPERATOR_CONSOLE_ORG_ID;

  if (!orgId) {
    throw new Error(
      "OPERATOR_CONSOLE_ORG_ID is required when OPERATOR_CONSOLE_DATA_SOURCE=postgres"
    );
  }

  return {
    orgId,
    operatorId: process.env.OPERATOR_CONSOLE_OPERATOR_ID ?? null,
    serviceRole: process.env.OPERATOR_CONSOLE_SERVICE_ROLE === "true",
    elevationScope:
      process.env.OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION === "true"
        ? PRODUCTION_DB_ELEVATION_SCOPE
        : null,
  };
}

export function createOperatorConsoleRepository(): OperatorConsoleRepository {
  const dataSource = resolveOperatorConsoleDataSource();

  if (dataSource === "fixture") {
    return createFixtureOperatorConsoleRepository();
  }

  return createPostgresOperatorConsoleRepository(
    getOperatorConsolePostgresSessionFromEnv()
  );
}

async function getOperatorConsoleSnapshotFromPostgres(
  session: OperatorDbSession,
  query: QueryRows
): Promise<OperatorConsoleSnapshot> {
  const [moduleRows, buildRows, auditRows, lineageRows, licenseRows, workItemRows] =
    await Promise.all([
      query<ModuleCountRow>(moduleCountsSql, [], session),
      query<BuildRow>(buildsSql, [], session),
      query<AuditEventRow>(auditRowsSql, [], session),
      query<LineageRow>(lineageRowsSql, [], session),
      query<LicenseClauseRow>(licenseRowsSql, [], session),
      query<WorkItemRow>(moduleWorkItemsSql, [], session),
    ]);

  const modules = mergeModuleCounts(moduleRows);
  const builds = buildRows.map(mapBuildRow);
  const fallbackBuild: DemoBuild = {
    id: "bd_empty",
    title: "No active builds",
    buyerBriefId: "br_unassigned",
    supplierOrgId: "so_unassigned",
    state: "planned",
    eta: "TBD",
    qScore: 0,
    costUsedUsd: 0,
    budgetUsd: 0,
    gates: createBuildGates([]),
  };
  const licensePreview = buildLicensePreview(licenseRows);

  return {
    generatedAt: new Date().toISOString(),
    modules,
    triage: {
      blockers: modules.reduce((total, entry) => total + entry.blockedRecords, 0),
      overdueGates: Number(
        moduleRows.find((row) => row.key === "pipeline")?.blocked_records ?? 0
      ),
      releasesThisWeek: builds.filter((build) => build.state === "released").length,
      queuedJobs: Number(
        moduleRows.find((row) => row.key === "operations")?.blocked_records ?? 0
      ),
    },
    builds,
    featuredBuild: builds[0] ?? fallbackBuild,
    licensePreview,
    workflowCoverage: Object.fromEntries(
      Object.entries(workflowDefinitions).map(([workflow, definition]) => [
        workflow,
        [...definition.states],
      ])
    ) as Record<WorkflowName, string[]>,
    workItems: groupWorkItems(workItemRows.map(mapWorkItemRow)),
    lineageEvents: lineageRows.map((row) => ({
      id: row.id,
      namespace: row.namespace,
      jobName: row.job_name,
      datasetVersionId: row.dataset_version_id ?? "dv_unassigned",
      emittedAt: normalizeDate(row.emitted_at),
    })),
    auditRows: auditRows.map((row) => ({
      id: row.id,
      actor: row.actor ?? "system",
      action: row.action,
      target: row.target,
      createdAt: normalizeDate(row.created_at),
    })),
  };
}

function mapWorkItemRow(row: WorkItemRow): OperatorWorkItem {
  const fields = normalizeWorkItemFields(row.field_values);

  return {
    moduleKey: row.module_key,
    recordType: row.record_type,
    id: row.id,
    title: row.title,
    state: row.state,
    detail: row.detail ?? "",
    ...(fields ? { fields } : {}),
    updatedAt: normalizeDate(row.updated_at),
    severity: row.severity,
    nextAction: row.next_action ?? "Review",
  };
}

function normalizeWorkItemFields(
  fieldValues: WorkItemRow["field_values"]
): Record<string, string> | null {
  if (!fieldValues) {
    return null;
  }

  const parsed =
    typeof fieldValues === "string"
      ? (JSON.parse(fieldValues) as Record<string, unknown>)
      : fieldValues;

  const fields = Object.fromEntries(
    Object.entries(parsed)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)])
  );

  return Object.keys(fields).length > 0 ? fields : null;
}

async function persistOperatorTransitionToPostgres(
  input: PersistOperatorTransitionInput,
  session: OperatorDbSession,
  query: QueryRows
): Promise<PersistOperatorTransitionResult> {
  const auditEvent = buildTransitionAuditEvent(input);
  const tableName = transitionWorkflowTables[input.workflow];
  const rows = await query<PersistTransitionRow>(
    buildPersistTransitionSql(tableName),
    [
      input.toState,
      input.targetId,
      input.fromState,
      createPrefixedId("ae"),
      session.operatorId ?? null,
      auditEvent.target_type,
      auditEvent.target_id,
      JSON.stringify(auditEvent.metadata),
    ],
    session
  );

  const row = rows[0];

  if (!row) {
    throw new OperatorTransitionConflictError(
      `${input.workflow}/${input.targetId} was not in expected state ${input.fromState}`
    );
  }

  return {
    auditEvent: {
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      metadata: normalizeAuditMetadata(row.metadata),
    },
    auditEventId: row.id,
    createdAt: normalizeDate(row.created_at),
    persisted: true,
  };
}

function normalizeAuditMetadata(
  metadata: PersistTransitionRow["metadata"]
): TransitionAuditEvent["metadata"] {
  return typeof metadata === "string"
    ? (JSON.parse(metadata) as TransitionAuditEvent["metadata"])
    : metadata;
}

function mergeModuleCounts(rows: ModuleCountRow[]) {
  const counts = new Map(
    rows.map((row) => [
      row.key,
      {
        totalRecords: Number(row.total_records),
        blockedRecords: Number(row.blocked_records),
      },
    ])
  );

  return operatorModuleSummaries.map((module) => ({
    ...module,
    totalRecords: counts.get(module.key)?.totalRecords ?? 0,
    blockedRecords: counts.get(module.key)?.blockedRecords ?? 0,
  }));
}

function mapBuildRow(row: BuildRow): DemoBuild {
  const gateRows =
    typeof row.gates === "string"
      ? (JSON.parse(row.gates) as { key: GateKey; state: BuildGate["state"] }[])
      : row.gates ?? [];
  const gateStateByKey = new Map(gateRows.map((gate) => [gate.key, gate.state]));

  return {
    id: row.id,
    title: row.title,
    buyerBriefId: row.buyer_brief_id ?? "br_unassigned",
    supplierOrgId: row.supplier_org_id ?? "so_unassigned",
    state: row.state,
    eta: row.eta ?? "TBD",
    qScore: Number(row.q_score ?? 0),
    costUsedUsd: Number(row.cost_used_usd ?? 0),
    budgetUsd: Number(row.budget_usd ?? 0),
    gates: createBuildGates(
      (["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"] as GateKey[]).map(
        (key) => gateStateByKey.get(key) ?? "pending"
      )
    ),
  };
}

function buildLicensePreview(rows: LicenseClauseRow[]) {
  if (rows.length === 0) {
    return {
      composed: emptyComposedLicense("No active license clauses found"),
      requestedUseAllowed: false,
      requestedUseReasons: ["No active license clauses found"],
    };
  }

  const composed = composeLicenseGrants(rows.map(mapLicenseRow));
  const requestedUse = evaluateRequestedUse(composed, {
    train: true,
    commercialInference: true,
    geo: ["WW"],
  });

  return {
    composed,
    requestedUseAllowed: requestedUse.allowed,
    requestedUseReasons: requestedUse.allowed ? [] : requestedUse.reasons,
  };
}

function emptyComposedLicense(reason: string): ComposedLicense {
  return {
    permissions: {
      train: false,
      finetune: false,
      eval: false,
      commercialInference: false,
      redistribute: false,
    },
    geo: [],
    termStartsAt: null,
    termEndsAt: null,
    exclusivity: "none",
    shareAlike: false,
    sourceClauseIds: [],
    blockedReasons: [reason],
  };
}

function mapLicenseRow(row: LicenseClauseRow): LicenseGrant {
  return {
    id: row.id,
    permissions: {
      train: row.permits_train,
      finetune: row.permits_finetune,
      eval: row.permits_eval,
      commercialInference: row.permits_inference_commercial,
      redistribute: row.permits_redistribute,
    },
    geo: row.geo,
    termStartsAt: row.term_starts_at ? normalizeDate(row.term_starts_at) : null,
    termEndsAt: row.term_ends_at ? normalizeDate(row.term_ends_at) : null,
    exclusivity: row.exclusivity,
    shareAlike: row.share_alike,
  };
}

function normalizeDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

const transitionWorkflowTables = {
  buyer_opportunity: '"buyer_opportunity"',
  supplier_opportunity: '"supplier_opportunity"',
  build: '"build"',
  run: '"run"',
  label_batch: '"label_batch"',
  contract: '"contract"',
  delivery: '"delivery"',
  dsar: '"dsar_request"',
} satisfies Record<WorkflowName, string>;

function buildPersistTransitionSql(tableName: string) {
  return `
    WITH updated AS (
      UPDATE ${tableName}
      SET state = $1
      WHERE id = $2
        AND state = $3
        AND deleted_at IS NULL
      RETURNING id, org_id
    ),
    inserted AS (
      INSERT INTO audit_event (
        id,
        org_id,
        actor_id,
        action,
        target_type,
        target_id,
        metadata
      )
      SELECT
        $4,
        org_id,
        $5,
        'state_transition',
        $6,
        $7,
        $8::jsonb
      FROM updated
      RETURNING id, action, target_type, target_id, metadata, created_at
    )
    SELECT id, action, target_type, target_id, metadata, created_at
    FROM inserted
  `;
}

const moduleCountsSql = `
  SELECT * FROM (
    SELECT 'pipeline'::text AS key,
      (SELECT count(*)::int FROM build WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM alert WHERE deleted_at IS NULL) AS total_records,
      (SELECT count(*)::int FROM gate_event WHERE verdict = 'blocked') +
      (SELECT count(*)::int FROM alert WHERE state = 'open' AND severity = 'critical' AND deleted_at IS NULL) AS blocked_records
    UNION ALL SELECT 'leads',
      (SELECT count(*)::int FROM buyer_opportunity WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM supplier_opportunity WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM buyer_opportunity WHERE state = 'closed_lost' AND deleted_at IS NULL) +
      (SELECT count(*)::int FROM supplier_opportunity WHERE state = 'terminated' AND deleted_at IS NULL)
    UNION ALL SELECT 'suppliers',
      (SELECT count(*)::int FROM organization WHERE kind = 'supplier' AND deleted_at IS NULL) +
      (SELECT count(*)::int FROM contact WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM supplier_asset WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM contract WHERE contract_type IN ('supplier','nda','dpa') AND deleted_at IS NULL) +
      (SELECT count(*)::int FROM license_clause WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM supplier_asset WHERE state = 'blocked' AND deleted_at IS NULL)
    UNION ALL SELECT 'buyers',
      (SELECT count(*)::int FROM organization WHERE kind = 'buyer' AND deleted_at IS NULL) +
      (SELECT count(*)::int FROM contact WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM dataset_brief WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM delivery WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM delivery WHERE state = 'disputed' AND deleted_at IS NULL)
    UNION ALL SELECT 'builds',
      (SELECT count(*)::int FROM build WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM build_plan WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM run WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM gate_event),
      (SELECT count(*)::int FROM build WHERE state = 'rework' AND deleted_at IS NULL)
    UNION ALL SELECT 'datasets',
      (SELECT count(*)::int FROM dataset WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM dataset_version WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM lineage_event),
      (SELECT count(*)::int FROM dataset_version WHERE state = 'draft' AND deleted_at IS NULL)
    UNION ALL SELECT 'labeling',
      (SELECT count(*)::int FROM label_batch WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM label_batch WHERE state = 'in_adjudication' AND deleted_at IS NULL)
    UNION ALL SELECT 'quality',
      (SELECT count(*)::int FROM qa_report WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM qa_report WHERE verdict = 'fail' AND deleted_at IS NULL)
    UNION ALL SELECT 'privacy',
      (SELECT count(*)::int FROM license_clause WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM consent_record WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM dsar_request WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM pii_map WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM dsar_request WHERE state <> 'completed' AND deleted_at IS NULL)
    UNION ALL SELECT 'catalogue',
      (SELECT count(*)::int FROM catalogue_listing WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM private_offer WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM catalogue_listing WHERE state = 'review' AND deleted_at IS NULL)
    UNION ALL SELECT 'commercials',
      (SELECT count(*)::int FROM quote WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM contract WHERE contract_type = 'buyer' AND deleted_at IS NULL) +
      (SELECT count(*)::int FROM invoice WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM payout WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM payout WHERE state IN ('failed', 'held') AND deleted_at IS NULL)
    UNION ALL SELECT 'operations',
      (SELECT count(*)::int FROM run WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM cost_entry) +
      (SELECT count(*)::int FROM alert WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM run WHERE state = 'queued' AND deleted_at IS NULL)
    UNION ALL SELECT 'audit',
      (SELECT count(*)::int FROM audit_event),
      0
    UNION ALL SELECT 'settings',
      (SELECT count(*)::int FROM integration WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM signing_key WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM "operator" WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM signing_key WHERE state = 'revoked' AND deleted_at IS NULL)
  ) module_counts
`;

const buildsSql = `
  SELECT
    b.id,
    b.title,
    b.dataset_brief_id AS buyer_brief_id,
    b.supplier_opportunity_id AS supplier_org_id,
    b.state,
    COALESCE(to_char(b.eta_at, 'DD Mon'), 'TBD') AS eta,
    COALESCE(b.q_score, 0)::float AS q_score,
    round(COALESCE(b.cost_used_cents, 0) / 100.0)::int AS cost_used_usd,
    round(COALESCE(NULLIF(b.cost_budget_cents, 0), 0) / 100.0)::int AS budget_usd,
    COALESCE(
      json_agg(
        json_build_object('key', ge.gate_key, 'state', ge.verdict)
        ORDER BY ge.gate_key
      ) FILTER (WHERE ge.id IS NOT NULL),
      '[]'::json
    ) AS gates
  FROM build b
  LEFT JOIN gate_event ge ON ge.build_id = b.id
  WHERE b.deleted_at IS NULL
  GROUP BY b.id
  ORDER BY b.updated_at DESC
  LIMIT 5
`;

const auditRowsSql = `
  SELECT
    ae.id,
    o.email AS actor,
    ae.action,
    ae.target_type || '/' || ae.target_id AS target,
    ae.created_at
  FROM audit_event ae
  LEFT JOIN "operator" o ON o.id = ae.actor_id
  ORDER BY ae.created_at DESC
  LIMIT 6
`;

const lineageRowsSql = `
  SELECT
    id,
    namespace,
    job_name,
    dataset_version_id,
    event_time AS emitted_at
  FROM lineage_event
  ORDER BY event_time DESC
  LIMIT 6
`;

const licenseRowsSql = `
  SELECT
    id,
    permits_train,
    permits_finetune,
    permits_eval,
    permits_inference_commercial,
    permits_redistribute,
    exclusivity,
    geo,
    term_starts_at,
    term_ends_at,
    share_alike
  FROM license_clause
  WHERE state = 'active' AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 20
`;

const moduleWorkItemsSql = `
  WITH raw_work_items AS (
    SELECT
      'pipeline'::text AS module_key,
      'build'::text AS record_type,
      b.id,
      b.title,
      b.state,
      COALESCE('ETA ' || to_char(b.eta_at, 'DD Mon'), 'No ETA') AS detail,
      b.updated_at,
      CASE WHEN b.state = 'rework' THEN 'critical' ELSE 'warning' END AS severity,
      CASE WHEN b.state = 'rework' THEN 'Assign rework owner' ELSE 'Review next gate' END AS next_action
    FROM build b
    WHERE b.deleted_at IS NULL
    UNION ALL
    SELECT
      'pipeline',
      'alert',
      al.id,
      al.title,
      al.state,
      COALESCE(al.target_type || '/' || al.target_id, al.severity),
      al.updated_at,
      CASE WHEN al.severity = 'critical' THEN 'critical' ELSE 'warning' END,
      'Acknowledge alert'
    FROM alert al
    WHERE al.deleted_at IS NULL
    UNION ALL
    SELECT
      'leads',
      'buyer_opportunity',
      bo.id,
      bo.title,
      bo.state,
      COALESCE(bo.modality, bo.timeline, 'Buyer opportunity'),
      bo.updated_at,
      CASE WHEN bo.state = 'closed_lost' THEN 'critical' ELSE 'info' END,
      'Advance buyer stage'
    FROM buyer_opportunity bo
    WHERE bo.deleted_at IS NULL
    UNION ALL
    SELECT
      'leads',
      'supplier_opportunity',
      so.id,
      so.title,
      so.state,
      so.asset_summary,
      so.updated_at,
      CASE WHEN so.state = 'terminated' THEN 'critical' ELSE 'info' END,
      'Advance supplier stage'
    FROM supplier_opportunity so
    WHERE so.deleted_at IS NULL
    UNION ALL
    SELECT
      'suppliers',
      'organization',
      org.id,
      org.display_name,
      org.state,
      COALESCE(org.website, org.jurisdiction, org.kind),
      org.updated_at,
      CASE WHEN org.state = 'paused' THEN 'warning' WHEN org.state = 'archived' THEN 'critical' ELSE 'info' END,
      'Review supplier org'
    FROM organization org
    WHERE org.kind = 'supplier' AND org.deleted_at IS NULL
    UNION ALL
    SELECT
      'suppliers',
      'contact',
      co.id,
      co.full_name,
      CASE WHEN co.signing_authority THEN 'signing_authority' ELSE 'contact' END,
      COALESCE(co.role, co.email::text, 'Supplier contact'),
      co.updated_at,
      CASE WHEN co.signing_authority THEN 'warning' ELSE 'info' END,
      'Review supplier contact'
    FROM contact co
    WHERE co.deleted_at IS NULL
    UNION ALL
    SELECT
      'suppliers',
      'supplier_asset',
      sa.id,
      sa.name,
      sa.state,
      sa.modality || ' / ' || sa.sensitivity,
      sa.updated_at,
      CASE WHEN sa.state = 'blocked' THEN 'critical' WHEN sa.state = 'rights_review' THEN 'warning' ELSE 'info' END,
      'Review asset rights'
    FROM supplier_asset sa
    WHERE sa.deleted_at IS NULL
    UNION ALL
    SELECT
      'suppliers',
      'contract',
      ct.id,
      ct.contract_type || ' contract',
      ct.state,
      COALESCE(ct.document_uri, 'Document pending'),
      ct.updated_at,
      CASE WHEN ct.state IN ('drafting','awaiting_buyer','awaiting_supplier') THEN 'warning' ELSE 'info' END,
      'Review contract'
    FROM contract ct
    WHERE ct.deleted_at IS NULL AND ct.contract_type IN ('supplier','nda','dpa')
    UNION ALL
    SELECT
      'suppliers',
      'license_clause',
      lc.id,
      'License clause',
      lc.state,
      COALESCE(lc.notes, lc.exclusivity),
      lc.updated_at,
      CASE WHEN lc.state = 'draft' THEN 'warning' WHEN lc.state = 'expired' THEN 'critical' ELSE 'info' END,
      'Review license clause'
    FROM license_clause lc
    WHERE lc.deleted_at IS NULL
    UNION ALL
    SELECT
      'buyers',
      'organization',
      org.id,
      org.display_name,
      org.state,
      COALESCE(org.website, org.jurisdiction, org.kind),
      org.updated_at,
      CASE WHEN org.state = 'paused' THEN 'warning' WHEN org.state = 'archived' THEN 'critical' ELSE 'info' END,
      'Review buyer org'
    FROM organization org
    WHERE org.kind = 'buyer' AND org.deleted_at IS NULL
    UNION ALL
    SELECT
      'buyers',
      'contact',
      co.id,
      co.full_name,
      CASE WHEN co.signing_authority THEN 'signing_authority' ELSE 'contact' END,
      COALESCE(co.role, co.email::text, 'Buyer contact'),
      co.updated_at,
      CASE WHEN co.signing_authority THEN 'warning' ELSE 'info' END,
      'Review buyer contact'
    FROM contact co
    WHERE co.deleted_at IS NULL
    UNION ALL
    SELECT
      'buyers',
      'dataset_brief',
      db.id,
      db.title,
      db.state,
      COALESCE(array_to_string(db.target_formats, ', '), 'No target formats'),
      db.updated_at,
      CASE WHEN db.state IN ('new','scoped','quoted') THEN 'warning' ELSE 'info' END,
      'Review buyer brief'
    FROM dataset_brief db
    WHERE db.deleted_at IS NULL
    UNION ALL
    SELECT
      'buyers',
      'delivery',
      dl.id,
      'Delivery ' || dl.channel,
      dl.state,
      COALESCE(dl.dataset_version_id, 'No dataset version'),
      dl.updated_at,
      CASE WHEN dl.state = 'disputed' THEN 'critical' ELSE 'info' END,
      'Review delivery'
    FROM delivery dl
    WHERE dl.deleted_at IS NULL
    UNION ALL
    SELECT
      'builds',
      'build',
      b.id,
      b.title,
      b.state,
      COALESCE('Q-score ' || b.q_score::text, 'No QA score'),
      b.updated_at,
      CASE WHEN b.state = 'rework' THEN 'critical' WHEN b.state IN ('qa','packaging') THEN 'warning' ELSE 'info' END,
      'Open build detail'
    FROM build b
    WHERE b.deleted_at IS NULL
    UNION ALL
    SELECT
      'builds',
      'build_plan',
      bp.id,
      'Build plan',
      bp.state,
      CASE WHEN bp.license_blocked THEN 'License blocked' ELSE left(bp.manifest_yaml, 80) END,
      bp.updated_at,
      CASE WHEN bp.license_blocked THEN 'critical' WHEN bp.state = 'draft' THEN 'warning' ELSE 'info' END,
      'Review build plan'
    FROM build_plan bp
    WHERE bp.deleted_at IS NULL
    UNION ALL
    SELECT
      'datasets',
      'dataset',
      d.id,
      d.name,
      d.state,
      d.modality,
      d.updated_at,
      CASE WHEN d.state = 'draft' THEN 'warning' WHEN d.state = 'retired' THEN 'critical' ELSE 'info' END,
      'Review dataset'
    FROM dataset d
    WHERE d.deleted_at IS NULL
    UNION ALL
    SELECT
      'datasets',
      'dataset_version',
      dv.id,
      d.name || ' ' || dv.version_label,
      dv.state,
      COALESCE(dv.record_count::text || ' records', dv.manifest_uri),
      dv.updated_at,
      CASE WHEN dv.state = 'draft' THEN 'warning' ELSE 'info' END,
      'Review dataset version'
    FROM dataset_version dv
    JOIN dataset d ON d.id = dv.dataset_id
    WHERE dv.deleted_at IS NULL
    UNION ALL
    SELECT
      'quality',
      'qa_report',
      qr.id,
      COALESCE(b.title, 'QA report'),
      qr.verdict,
      COALESCE('Composite ' || qr.composite_score::text, 'No composite score'),
      qr.updated_at,
      CASE WHEN qr.verdict = 'fail' THEN 'critical' WHEN qr.verdict = 'review' THEN 'warning' ELSE 'info' END,
      'Review QA report'
    FROM qa_report qr
    LEFT JOIN build b ON b.id = qr.build_id
    WHERE qr.deleted_at IS NULL
    UNION ALL
    SELECT
      'labeling',
      'label_batch',
      lb.id,
      COALESCE(b.title, 'Label batch'),
      lb.state,
      'Queue depth ' || lb.queue_depth::text,
      lb.updated_at,
      CASE WHEN lb.state = 'in_adjudication' THEN 'warning' ELSE 'info' END,
      'Review label batch'
    FROM label_batch lb
    LEFT JOIN build b ON b.id = lb.build_id
    WHERE lb.deleted_at IS NULL
    UNION ALL
    SELECT
      'privacy',
      'dsar_request',
      ds.id,
      ds.request_type || ' request',
      ds.state,
      'SLA ' || to_char(ds.sla_due_at, 'DD Mon'),
      ds.updated_at,
      CASE WHEN ds.state <> 'completed' AND ds.sla_due_at < now() + interval '7 days' THEN 'warning' ELSE 'info' END,
      'Review DSAR'
    FROM dsar_request ds
    WHERE ds.deleted_at IS NULL
    UNION ALL
    SELECT
      'privacy',
      'license_clause',
      lc.id,
      'License clause',
      lc.state,
      COALESCE(lc.notes, lc.exclusivity),
      lc.updated_at,
      CASE WHEN lc.state = 'draft' THEN 'warning' WHEN lc.state = 'expired' THEN 'critical' ELSE 'info' END,
      'Review license clause'
    FROM license_clause lc
    WHERE lc.deleted_at IS NULL
    UNION ALL
    SELECT
      'privacy',
      'consent_record',
      cr.id,
      cr.subject_ref,
      cr.state,
      cr.lawful_basis,
      cr.updated_at,
      CASE WHEN cr.state <> 'active' THEN 'warning' ELSE 'info' END,
      'Review consent'
    FROM consent_record cr
    WHERE cr.deleted_at IS NULL
    UNION ALL
    SELECT
      'privacy',
      'pii_map',
      pm.id,
      COALESCE(pm.dataset_version_id, 'PII map'),
      pm.state,
      'PII treatment review',
      pm.updated_at,
      CASE WHEN pm.state = 'blocked' THEN 'critical' WHEN pm.state = 'review' THEN 'warning' ELSE 'info' END,
      'Review PII map'
    FROM pii_map pm
    WHERE pm.deleted_at IS NULL
    UNION ALL
    SELECT
      'catalogue',
      'catalogue_listing',
      cl.id,
      cl.title,
      cl.state,
      COALESCE(cl.dataset_id, 'No dataset'),
      cl.updated_at,
      CASE WHEN cl.state = 'review' THEN 'warning' ELSE 'info' END,
      'Review listing'
    FROM catalogue_listing cl
    WHERE cl.deleted_at IS NULL
    UNION ALL
    SELECT
      'catalogue',
      'private_offer',
      po.id,
      'Private offer',
      po.state,
      po.buyer_org_id,
      po.updated_at,
      CASE WHEN po.state = 'draft' THEN 'warning' ELSE 'info' END,
      'Review private offer'
    FROM private_offer po
    WHERE po.deleted_at IS NULL
    UNION ALL
    SELECT
      'commercials',
      'quote',
      qt.id,
      'Quote ' || qt.currency || ' ' || round(qt.amount_cents / 100.0)::text,
      qt.state,
      COALESCE(qt.buyer_opportunity_id, 'No buyer opportunity'),
      qt.updated_at,
      CASE WHEN qt.state = 'draft' THEN 'warning' ELSE 'info' END,
      'Review quote'
    FROM quote qt
    WHERE qt.deleted_at IS NULL
    UNION ALL
    SELECT
      'commercials',
      'contract',
      ct.id,
      ct.contract_type || ' contract',
      ct.state,
      COALESCE(ct.document_uri, 'Document pending'),
      ct.updated_at,
      CASE WHEN ct.state IN ('drafting','awaiting_buyer','awaiting_supplier') THEN 'warning' ELSE 'info' END,
      'Review buyer contract'
    FROM contract ct
    WHERE ct.deleted_at IS NULL AND ct.contract_type = 'buyer'
    UNION ALL
    SELECT
      'commercials',
      'invoice',
      iv.id,
      'Invoice ' || iv.currency || ' ' || round(iv.amount_cents / 100.0)::text,
      iv.state,
      COALESCE(iv.stripe_invoice_id, iv.quote_id, 'No quote'),
      iv.updated_at,
      CASE WHEN iv.state IN ('open','uncollectible') THEN 'warning' ELSE 'info' END,
      'Review invoice'
    FROM invoice iv
    WHERE iv.deleted_at IS NULL
    UNION ALL
    SELECT
      'commercials',
      'payout',
      py.id,
      'Payout ' || py.currency || ' ' || round(py.amount_cents / 100.0)::text,
      py.state,
      py.supplier_org_id,
      py.updated_at,
      CASE WHEN py.state IN ('failed','held') THEN 'critical' ELSE 'info' END,
      'Review payout'
    FROM payout py
    WHERE py.deleted_at IS NULL
    UNION ALL
    SELECT
      'operations',
      'run',
      rn.id,
      COALESCE(rn.external_run_id, rn.id),
      rn.state,
      'Retry ' || rn.retry_count::text,
      rn.updated_at,
      CASE WHEN rn.state = 'failed' THEN 'critical' WHEN rn.state = 'queued' THEN 'warning' ELSE 'info' END,
      'Review run'
    FROM run rn
    WHERE rn.deleted_at IS NULL
    UNION ALL
    SELECT
      'operations',
      'alert',
      al.id,
      al.title,
      al.state,
      COALESCE(al.target_type || '/' || al.target_id, al.severity),
      al.updated_at,
      CASE WHEN al.severity = 'critical' THEN 'critical' ELSE 'warning' END,
      'Acknowledge alert'
    FROM alert al
    WHERE al.deleted_at IS NULL
    UNION ALL
    SELECT
      'operations',
      'cost_entry',
      ce.id,
      ce.category || ' cost',
      ce.currency,
      round(ce.amount_cents / 100.0)::text,
      ce.created_at,
      'info',
      'Review cost entry'
    FROM cost_entry ce
    UNION ALL
    SELECT
      'audit',
      'audit_event',
      ae.id,
      ae.action,
      ae.target_type,
      ae.target_type || '/' || ae.target_id,
      ae.created_at,
      'info',
      'Open audit event'
    FROM audit_event ae
    UNION ALL
    SELECT
      'settings',
      'integration',
      i.id,
      i.provider,
      i.state,
      'Encrypted integration config',
      i.updated_at,
      CASE WHEN i.state = 'revoked' THEN 'critical' WHEN i.state = 'paused' THEN 'warning' ELSE 'info' END,
      'Review integration'
    FROM integration i
    WHERE i.deleted_at IS NULL
    UNION ALL
    SELECT
      'settings',
      'signing_key',
      sk.id,
      sk.algorithm || ' signing key',
      sk.state,
      sk.public_key,
      sk.updated_at,
      CASE WHEN sk.state = 'revoked' THEN 'critical' WHEN sk.state = 'retired' THEN 'warning' ELSE 'info' END,
      'Review signing key'
    FROM signing_key sk
    WHERE sk.deleted_at IS NULL
  ),
  work_items AS (
    SELECT
      raw_work_items.*,
      CASE
        WHEN record_type = 'buyer_opportunity' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'modality', bo.modality,
            'budgetRange', bo.budget_range ->> 'summary',
            'timeline', bo.timeline
          ))
          FROM buyer_opportunity bo
          WHERE bo.id = raw_work_items.id
        )
        WHEN record_type = 'supplier_asset' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'modality', sa.modality,
            'declaredVolume', sa.declared_volume ->> 'summary',
            'refreshPolicy', sa.refresh_policy,
            'sensitivity', sa.sensitivity
          ))
          FROM supplier_asset sa
          WHERE sa.id = raw_work_items.id
        )
        WHEN record_type = 'contract' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'contractType', ct.contract_type,
            'documentUri', ct.document_uri,
            'signedAt', ct.signed_at,
            'startsAt', ct.starts_at,
            'endsAt', ct.ends_at
          ))
          FROM contract ct
          WHERE ct.id = raw_work_items.id
        )
        WHEN record_type = 'license_clause' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'permittedUses',
            concat_ws(
              ', ',
              CASE WHEN lc.permits_train THEN 'train' END,
              CASE WHEN lc.permits_finetune THEN 'finetune' END,
              CASE WHEN lc.permits_eval THEN 'eval' END,
              CASE WHEN lc.permits_inference_commercial THEN 'commercial_inference' END,
              CASE WHEN lc.permits_redistribute THEN 'redistribute' END
            ),
            'geo', array_to_string(lc.geo, ', '),
            'exclusivity', lc.exclusivity,
            'termEndsAt', lc.term_ends_at,
            'shareAlike', lc.share_alike
          ))
          FROM license_clause lc
          WHERE lc.id = raw_work_items.id
        )
        WHEN record_type = 'dataset_brief' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'targetFormats', array_to_string(db.target_formats, ', '),
            'sensitivityConstraints', db.sensitivity_constraints ->> 'summary'
          ))
          FROM dataset_brief db
          WHERE db.id = raw_work_items.id
        )
        WHEN record_type = 'delivery' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'channel', dl.channel,
            'receiptHash', dl.receipt ->> 'receiptHash',
            'acceptanceWindowDays', dl.receipt ->> 'acceptanceWindowDays'
          ))
          FROM delivery dl
          WHERE dl.id = raw_work_items.id
        )
        WHEN record_type = 'build' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'etaAt', b.eta_at,
            'qScore', b.q_score,
            'costBudgetCents', b.cost_budget_cents,
            'costUsedCents', b.cost_used_cents
          ))
          FROM build b
          WHERE b.id = raw_work_items.id
        )
        WHEN record_type = 'build_plan' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'licenseBlocked', bp.license_blocked,
            'permitSummary', bp.composed_permits ->> 'summary'
          ))
          FROM build_plan bp
          WHERE bp.id = raw_work_items.id
        )
        WHEN record_type = 'dataset' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'modality', d.modality
          ))
          FROM dataset d
          WHERE d.id = raw_work_items.id
        )
        WHEN record_type = 'dataset_version' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'contentHash', dv.content_hash,
            'recordCount', dv.record_count,
            'sizeBytes', dv.size_bytes,
            'qaScore', dv.qa_score
          ))
          FROM dataset_version dv
          WHERE dv.id = raw_work_items.id
        )
        WHEN record_type = 'qa_report' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'compositeScore', qr.composite_score
          ))
          FROM qa_report qr
          WHERE qr.id = raw_work_items.id
        )
        WHEN record_type = 'label_batch' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'queueDepth', lb.queue_depth,
            'agreementScore', lb.agreement_score
          ))
          FROM label_batch lb
          WHERE lb.id = raw_work_items.id
        )
        WHEN record_type = 'consent_record' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'lawfulBasis', cr.lawful_basis,
            'evidenceUri', cr.evidence_uri
          ))
          FROM consent_record cr
          WHERE cr.id = raw_work_items.id
        )
        WHEN record_type = 'dsar_request' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'requestType', ds.request_type,
            'slaDays',
            CASE
              WHEN ds.sla_due_at IS NULL THEN NULL
              ELSE GREATEST(
                1,
                ceil(extract(epoch FROM (ds.sla_due_at - now())) / 86400.0)::int
              )
            END
          ))
          FROM dsar_request ds
          WHERE ds.id = raw_work_items.id
        )
        WHEN record_type = 'pii_map' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'treatmentSummary', pm.treatments ->> 'summary'
          ))
          FROM pii_map pm
          WHERE pm.id = raw_work_items.id
        )
        WHEN record_type = 'catalogue_listing' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'priceCents', cl.pricing ->> 'priceCents',
            'currency', cl.pricing ->> 'currency',
            'billingModel', cl.pricing ->> 'billingModel'
          ))
          FROM catalogue_listing cl
          WHERE cl.id = raw_work_items.id
        )
        WHEN record_type = 'private_offer' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'offerValueCents', po.terms ->> 'offerValueCents',
            'currency', po.terms ->> 'currency',
            'expiresAt', po.terms ->> 'expiresAt'
          ))
          FROM private_offer po
          WHERE po.id = raw_work_items.id
        )
        WHEN record_type = 'quote' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'amountCents', qt.amount_cents,
            'currency', qt.currency
          ))
          FROM quote qt
          WHERE qt.id = raw_work_items.id
        )
        WHEN record_type = 'invoice' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'amountCents', iv.amount_cents,
            'currency', iv.currency
          ))
          FROM invoice iv
          WHERE iv.id = raw_work_items.id
        )
        WHEN record_type = 'payout' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'amountCents', py.amount_cents,
            'currency', py.currency
          ))
          FROM payout py
          WHERE py.id = raw_work_items.id
        )
        WHEN record_type = 'run' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'externalRunId', rn.external_run_id,
            'retryCount', rn.retry_count,
            'startedAt', rn.started_at,
            'finishedAt', rn.finished_at
          ))
          FROM run rn
          WHERE rn.id = raw_work_items.id
        )
        WHEN record_type = 'cost_entry' THEN (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'amountCents', ce.amount_cents,
            'metadataSummary', ce.metadata ->> 'summary'
          ))
          FROM cost_entry ce
          WHERE ce.id = raw_work_items.id
        )
        ELSE '{}'::jsonb
      END AS field_values
    FROM raw_work_items
  ),
  ranked AS (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY module_key
        ORDER BY
          CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          updated_at DESC,
          id
      ) AS work_rank,
      row_number() OVER (
        PARTITION BY module_key, record_type
        ORDER BY
          CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          updated_at DESC,
          id
      ) AS type_rank
    FROM work_items
  )
  SELECT
    module_key,
    record_type,
    id,
    title,
    state,
    detail,
    updated_at,
    severity,
    next_action,
    field_values
  FROM ranked
  WHERE work_rank <= 4 OR type_rank = 1
  ORDER BY module_key, work_rank, record_type
`;
