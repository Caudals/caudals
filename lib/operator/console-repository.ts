import {
  composeLicenseGrants,
  evaluateRequestedUse,
  type ComposedLicense,
  type LicenseGrant,
} from "@/lib/operator/license-composition";
import {
  createBuildGates,
  getOperatorConsoleSnapshot,
  operatorModuleSummaries,
  type BuildGate,
  type DemoBuild,
  type GateKey,
  type OperatorConsoleSnapshot,
  type OperatorModuleKey,
} from "@/lib/operator/console-snapshot";
import { createPrefixedId } from "@/lib/operator/ids";
import {
  buildTransitionAuditEvent,
  workflowDefinitions,
  type TransitionAuditEvent,
  type WorkflowName,
} from "@/lib/operator/workflows";
import { queryRows, type OperatorDbSession, type QueryValue } from "@/lib/db/client";

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
  const [moduleRows, buildRows, auditRows, lineageRows, licenseRows] =
    await Promise.all([
      query<ModuleCountRow>(moduleCountsSql, [], session),
      query<BuildRow>(buildsSql, [], session),
      query<AuditEventRow>(auditRowsSql, [], session),
      query<LineageRow>(lineageRowsSql, [], session),
      query<LicenseClauseRow>(licenseRowsSql, [], session),
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
      (SELECT count(*)::int FROM supplier_asset WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM supplier_asset WHERE state = 'blocked' AND deleted_at IS NULL)
    UNION ALL SELECT 'buyers',
      (SELECT count(*)::int FROM dataset_brief WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM delivery WHERE state = 'disputed' AND deleted_at IS NULL)
    UNION ALL SELECT 'builds',
      (SELECT count(*)::int FROM build WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM build WHERE state = 'rework' AND deleted_at IS NULL)
    UNION ALL SELECT 'datasets',
      (SELECT count(*)::int FROM dataset WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM dataset_version WHERE state = 'draft' AND deleted_at IS NULL)
    UNION ALL SELECT 'quality',
      (SELECT count(*)::int FROM qa_report WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM qa_report WHERE verdict = 'fail' AND deleted_at IS NULL)
    UNION ALL SELECT 'privacy',
      (SELECT count(*)::int FROM license_clause WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM dsar_request WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM dsar_request WHERE state <> 'completed' AND deleted_at IS NULL)
    UNION ALL SELECT 'catalogue',
      (SELECT count(*)::int FROM catalogue_listing WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM private_offer WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM catalogue_listing WHERE state = 'review' AND deleted_at IS NULL)
    UNION ALL SELECT 'commercials',
      (SELECT count(*)::int FROM quote WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM invoice WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM payout WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM payout WHERE state IN ('failed', 'held') AND deleted_at IS NULL)
    UNION ALL SELECT 'operations',
      (SELECT count(*)::int FROM run WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM alert WHERE deleted_at IS NULL),
      (SELECT count(*)::int FROM run WHERE state = 'queued' AND deleted_at IS NULL)
    UNION ALL SELECT 'audit',
      (SELECT count(*)::int FROM audit_event),
      0
    UNION ALL SELECT 'settings',
      (SELECT count(*)::int FROM integration WHERE deleted_at IS NULL) +
      (SELECT count(*)::int FROM signing_key WHERE deleted_at IS NULL),
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
