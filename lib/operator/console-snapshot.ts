import {
  composeLicenseGrants,
  evaluateRequestedUse,
  type ComposedLicense,
  type LicenseGrant,
} from "@/lib/operator/license-composition";
import { workflowDefinitions, type WorkflowName } from "@/lib/operator/workflows";

export const operatorModuleKeys = [
  "pipeline",
  "leads",
  "suppliers",
  "buyers",
  "builds",
  "datasets",
  "labeling",
  "quality",
  "privacy",
  "catalogue",
  "commercials",
  "operations",
  "audit",
  "settings",
] as const;

export type OperatorModuleKey = (typeof operatorModuleKeys)[number];

export type OperatorModuleSummary = {
  key: OperatorModuleKey;
  title: string;
  description: string;
  anchorRecords: string[];
  totalRecords: number;
  blockedRecords: number;
  savedViews: string[];
};

export type GateKey = "G-1" | "G-2" | "G-3" | "G-4" | "G-5" | "G-6" | "G-7";

export type BuildGate = {
  key: GateKey;
  label: string;
  state: "pass" | "review" | "blocked" | "pending";
};

export type DemoBuild = {
  id: string;
  title: string;
  buyerBriefId: string;
  supplierOrgId: string;
  state: string;
  eta: string;
  qScore: number;
  costUsedUsd: number;
  budgetUsd: number;
  gates: BuildGate[];
};

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
};

export type LineageEventRow = {
  id: string;
  namespace: string;
  jobName: string;
  datasetVersionId: string;
  emittedAt: string;
};

export type OperatorWorkItem = {
  moduleKey: OperatorModuleKey;
  recordType: string;
  id: string;
  title: string;
  state: string;
  detail: string;
  fields?: Record<string, string>;
  updatedAt: string;
  severity: "info" | "warning" | "critical";
  nextAction: string;
};

export type OperatorConsoleSnapshot = {
  generatedAt: string;
  modules: OperatorModuleSummary[];
  triage: {
    blockers: number;
    overdueGates: number;
    releasesThisWeek: number;
    queuedJobs: number;
  };
  builds: DemoBuild[];
  featuredBuild: DemoBuild;
  licensePreview: {
    composed: ComposedLicense;
    requestedUseAllowed: boolean;
    requestedUseReasons: string[];
  };
  workflowCoverage: Record<WorkflowName, string[]>;
  workItems: Record<OperatorModuleKey, OperatorWorkItem[]>;
  lineageEvents: LineageEventRow[];
  auditRows: AuditRow[];
};

export const gateLabels: Record<GateKey, string> = {
  "G-1": "Intake",
  "G-2": "Profile",
  "G-3": "Clean",
  "G-4": "Privacy",
  "G-5": "Enrich",
  "G-6": "Label",
  "G-7": "QA",
};

export function isOperatorModuleKey(
  value: string | null | undefined
): value is OperatorModuleKey {
  return operatorModuleKeys.includes(value as OperatorModuleKey);
}

export const operatorModuleSummaries: OperatorModuleSummary[] = [
  {
    key: "pipeline",
    title: "Pipeline / Home",
    description: "Cross-domain triage, blockers, overdue gates, and release calendar.",
    anchorRecords: ["build", "gate_event", "alert"],
    totalRecords: 42,
    blockedRecords: 6,
    savedViews: ["Today", "My blockers", "Release week"],
  },
  {
    key: "leads",
    title: "Leads & Opportunities",
    description: "Buyer and supplier qualification, scoping, and stage transitions.",
    anchorRecords: ["buyer_opportunity", "supplier_opportunity"],
    totalRecords: 31,
    blockedRecords: 4,
    savedViews: ["Unqualified", "Feasibility", "Stale NDA"],
  },
  {
    key: "suppliers",
    title: "Suppliers",
    description: "Organizations, contacts, contracts, assets, and license clauses.",
    anchorRecords: ["organization", "supplier_asset", "contract", "license_clause"],
    totalRecords: 18,
    blockedRecords: 2,
    savedViews: ["Rights review", "New samples", "Live suppliers"],
  },
  {
    key: "buyers",
    title: "Buyers",
    description: "Organizations, contacts, briefs, subscriptions, sample reviews, and deliveries.",
    anchorRecords: ["organization", "contact", "dataset_brief", "subscription", "delivery"],
    totalRecords: 25,
    blockedRecords: 3,
    savedViews: ["New briefs", "Subscriptions", "Delivery risk"],
  },
  {
    key: "builds",
    title: "Builds",
    description: "Active builds, gate state, QA readouts, rebuilds, and replay controls.",
    anchorRecords: ["build", "run", "gate_event", "build_plan"],
    totalRecords: 5,
    blockedRecords: 1,
    savedViews: ["Concurrent demos", "QA pending", "Rework"],
  },
  {
    key: "datasets",
    title: "Datasets",
    description: "Dataset families, versions, delta manifests, modality contracts, lineage, and sample previews.",
    anchorRecords: ["dataset", "dataset_version", "delta_manifest", "modality_contract", "lineage_event"],
    totalRecords: 14,
    blockedRecords: 2,
    savedViews: ["Released", "Delta manifests", "Modality review"],
  },
  {
    key: "labeling",
    title: "Labeling",
    description: "Reviewer queues, active-learning loops, agreement review, and adjudication depth.",
    anchorRecords: ["label_batch", "active_learning_loop"],
    totalRecords: 9,
    blockedRecords: 2,
    savedViews: ["Queue depth", "Active learning", "Reviewer drift"],
  },
  {
    key: "quality",
    title: "Quality",
    description: "QA reports, Cleanlab scans, enrichment manifests, exception logs, and buyer-ready verdicts.",
    anchorRecords: ["qa_report", "cleanlab_qa_pass", "enrichment_manifest"],
    totalRecords: 23,
    blockedRecords: 5,
    savedViews: ["Exceptions", "Cleanlab scan", "Release blockers"],
  },
  {
    key: "privacy",
    title: "Privacy & Rights",
    description: "License vault, consent registry, DSAR queue, and retention schedules.",
    anchorRecords: ["license_clause", "consent_record", "dsar_request", "pii_map"],
    totalRecords: 16,
    blockedRecords: 3,
    savedViews: ["DSAR SLA", "PII review", "Expiring terms"],
  },
  {
    key: "catalogue",
    title: "Catalogue & Offers",
    description: "Operator-managed listings, pricing, preview gates, and private offers.",
    anchorRecords: ["catalogue_listing", "private_offer", "sample_preview_access", "quote"],
    totalRecords: 10,
    blockedRecords: 2,
    savedViews: ["Draft listings", "Private offers", "Preview gates"],
  },
  {
    key: "commercials",
    title: "Commercials",
    description: "Quotes, contracts, invoices, supplier payouts, and Stripe test state.",
    anchorRecords: ["quote", "contract", "invoice", "payout"],
    totalRecords: 21,
    blockedRecords: 2,
    savedViews: ["Awaiting signature", "Payout holds", "Renewals"],
  },
  {
    key: "operations",
    title: "Operations",
    description: "Job queue, utilization, cost ledger, alerts, and runbooks.",
    anchorRecords: ["run", "cost_entry", "alert"],
    totalRecords: 37,
    blockedRecords: 4,
    savedViews: ["Queue depth", "Budget risk", "Escalations"],
  },
  {
    key: "audit",
    title: "Audit",
    description: "Cross-domain audit search and scoped evidence exports.",
    anchorRecords: ["audit_event"],
    totalRecords: 128,
    blockedRecords: 0,
    savedViews: ["Privileged reads", "License changes", "Exports"],
  },
  {
    key: "settings",
    title: "Settings",
    description: "Roles, integrations, signing keys, locale, and feature flags.",
    anchorRecords: ["operator_role", "integration", "signing_key"],
    totalRecords: 14,
    blockedRecords: 1,
    savedViews: ["Production roles", "Key rotation", "Flags"],
  },
];

export function createBuildGates(states: BuildGate["state"][]): BuildGate[] {
  return (Object.keys(gateLabels) as GateKey[]).map((key, index) => ({
    key,
    label: gateLabels[key],
    state: states[index] ?? "pending",
  }));
}

const demoBuilds: DemoBuild[] = [
  {
    id: "bd_01J2RECEIPTS",
    title: "Iberian retail receipts v3",
    buyerBriefId: "br_01J2BUYEU",
    supplierOrgId: "so_77RETAIL",
    state: "qa",
    eta: "21 May",
    qScore: 0.91,
    costUsedUsd: 1840,
    budgetUsd: 2500,
    gates: createBuildGates(["pass", "pass", "pass", "pass", "pass", "pass", "review"]),
  },
  {
    id: "bd_01J2ROUTES",
    title: "Cold-chain route telemetry pilot",
    buyerBriefId: "br_01J2LOG",
    supplierOrgId: "so_18FLEET",
    state: "privacy",
    eta: "24 May",
    qScore: 0.84,
    costUsedUsd: 960,
    budgetUsd: 1800,
    gates: createBuildGates(["pass", "pass", "pass", "review", "pending", "pending", "pending"]),
  },
  {
    id: "bd_01J2DOCS",
    title: "Warranty document extraction eval set",
    buyerBriefId: "br_01J2DOC",
    supplierOrgId: "so_22MFG",
    state: "labeling",
    eta: "27 May",
    qScore: 0.88,
    costUsedUsd: 1320,
    budgetUsd: 2100,
    gates: createBuildGates(["pass", "pass", "pass", "pass", "pass", "review", "pending"]),
  },
  {
    id: "bd_01J2AGRI",
    title: "Mediterranean crop imagery slice",
    buyerBriefId: "br_01J2CV",
    supplierOrgId: "so_45AGRI",
    state: "enriching",
    eta: "29 May",
    qScore: 0.79,
    costUsedUsd: 2210,
    budgetUsd: 2600,
    gates: createBuildGates(["pass", "pass", "pass", "pass", "review", "pending", "pending"]),
  },
  {
    id: "bd_01J2SUPPORT",
    title: "Spanish support-ticket safety corpus",
    buyerBriefId: "br_01J2LLM",
    supplierOrgId: "so_63SAAS",
    state: "rework",
    eta: "31 May",
    qScore: 0.73,
    costUsedUsd: 1780,
    budgetUsd: 1900,
    gates: createBuildGates(["pass", "pass", "blocked", "pass", "pending", "pending", "pending"]),
  },
];

const licenseGrants: LicenseGrant[] = [
  {
    id: "lc_01TRAINWW",
    permissions: {
      train: true,
      finetune: true,
      eval: true,
      commercialInference: true,
      redistribute: false,
    },
    geo: ["WW"],
  },
  {
    id: "lc_02EUNOCOM",
    permissions: {
      train: true,
      finetune: true,
      eval: true,
      commercialInference: false,
      redistribute: false,
    },
    geo: ["EU"],
    shareAlike: true,
  },
];

const fixtureWorkItems: OperatorWorkItem[] = [
  {
    moduleKey: "pipeline",
    recordType: "build",
    id: "bd_01J2SUPPORT",
    title: "Spanish support-ticket safety corpus",
    state: "rework",
    detail: "Blocked at G-3 cleaning",
    updatedAt: "2026-05-10T14:05:00.000Z",
    severity: "critical",
    nextAction: "Assign rework owner",
  },
  {
    moduleKey: "leads",
    recordType: "buyer_opportunity",
    id: "bo_01J2BUYEU",
    title: "Retail receipts buyer pilot",
    state: "pilot_active",
    detail: "Sample review pending",
    updatedAt: "2026-05-10T13:50:00.000Z",
    severity: "warning",
    nextAction: "Prepare pilot scorecard",
  },
  {
    moduleKey: "suppliers",
    recordType: "supplier_asset",
    id: "sa_01J2RETAIL",
    title: "Retail receipt archive",
    state: "rights_review",
    detail: "Contract clauses attached",
    updatedAt: "2026-05-10T13:40:00.000Z",
    severity: "warning",
    nextAction: "Review permitted uses",
  },
  {
    moduleKey: "buyers",
    recordType: "dataset_brief",
    id: "br_01J2BUYEU",
    title: "EU receipt OCR training set",
    state: "active",
    detail: "Parquet and JSONL requested",
    updatedAt: "2026-05-10T13:30:00.000Z",
    severity: "info",
    nextAction: "Confirm delivery format",
  },
  {
    moduleKey: "buyers",
    recordType: "subscription",
    id: "su_01J2SUBSCRIPTION",
    title: "Retail receipts monthly feed",
    state: "active",
    detail: "monthly / delta_share / window 3",
    updatedAt: "2026-05-10T13:25:00.000Z",
    severity: "info",
    nextAction: "Prepare subscription refresh",
  },
  {
    moduleKey: "builds",
    recordType: "build",
    id: "bd_01J2RECEIPTS",
    title: "Iberian retail receipts v3",
    state: "qa",
    detail: "QA pending, ETA 21 May",
    updatedAt: "2026-05-10T13:20:00.000Z",
    severity: "warning",
    nextAction: "Approve G-7",
  },
  {
    moduleKey: "datasets",
    recordType: "dataset_version",
    id: "dv_01RECEIPTSV3",
    title: "Retail receipts v3",
    state: "draft",
    detail: "Manifest ready, release signature pending",
    updatedAt: "2026-05-10T13:10:00.000Z",
    severity: "warning",
    nextAction: "Sign release artefact",
  },
  {
    moduleKey: "datasets",
    recordType: "delta_manifest",
    id: "dm_01J2DELTA",
    title: "Retail receipts May refresh delta",
    state: "ready",
    detail: "1,302 changed / QA 0.94",
    updatedAt: "2026-05-10T13:09:00.000Z",
    severity: "warning",
    nextAction: "Publish delta manifest",
  },
  {
    moduleKey: "datasets",
    recordType: "modality_contract",
    id: "mc_01J2DOC",
    title: "Receipt extraction document contract",
    state: "review",
    detail: "Parquet page records plus original PDF references",
    updatedAt: "2026-05-10T13:08:00.000Z",
    severity: "warning",
    nextAction: "Review modality contract",
  },
  {
    moduleKey: "datasets",
    recordType: "modality_contract",
    id: "mc_01J2TIME",
    title: "Cold-chain telemetry time-series contract",
    state: "review",
    detail: "Iceberg Parquet partitioned by event time and entity",
    updatedAt: "2026-05-10T13:07:30.000Z",
    severity: "warning",
    nextAction: "Review modality contract",
  },
  {
    moduleKey: "labeling",
    recordType: "label_batch",
    id: "lb_01J2RECEIPTS",
    title: "Receipt line-item label batch",
    state: "in_adjudication",
    detail: "Queue depth 42",
    updatedAt: "2026-05-10T13:05:00.000Z",
    severity: "warning",
    nextAction: "Review adjudication queue",
  },
  {
    moduleKey: "labeling",
    recordType: "active_learning_loop",
    id: "ll_01J2ACTIVE",
    title: "Crop imagery active-learning loop",
    state: "review",
    detail: "hybrid_uncertainty_diversity / selected 96/128",
    updatedAt: "2026-05-10T13:04:00.000Z",
    severity: "warning",
    nextAction: "Review active-learning loop",
  },
  {
    moduleKey: "quality",
    recordType: "qa_report",
    id: "qr_01J2RECEIPTS",
    title: "Receipt OCR QA scorecard",
    state: "review",
    detail: "Composite score 0.91",
    updatedAt: "2026-05-10T13:00:00.000Z",
    severity: "warning",
    nextAction: "Resolve duplicate cluster",
  },
  {
    moduleKey: "quality",
    recordType: "cleanlab_qa_pass",
    id: "cq_01J2CLEANLAB",
    title: "Receipt OCR Cleanlab pass",
    state: "review",
    detail: "3 suspected / 128 scanned",
    updatedAt: "2026-05-10T12:59:00.000Z",
    severity: "warning",
    nextAction: "Review Cleanlab pass",
  },
  {
    moduleKey: "quality",
    recordType: "enrichment_manifest",
    id: "em_01J2ENRICH",
    title: "Iberian retail receipts v3",
    state: "review",
    detail: "derived_features / supplier-contract",
    updatedAt: "2026-05-10T12:55:00.000Z",
    severity: "warning",
    nextAction: "Review enrichment manifest",
  },
  {
    moduleKey: "privacy",
    recordType: "dsar_request",
    id: "ds_01J2PRIV",
    title: "Receipt subject export",
    state: "impact_assessed",
    detail: "SLA due this week",
    updatedAt: "2026-05-10T12:50:00.000Z",
    severity: "warning",
    nextAction: "Start propagation",
  },
  {
    moduleKey: "catalogue",
    recordType: "catalogue_listing",
    id: "cl_01J2LIST",
    title: "Retail receipts private listing",
    state: "review",
    detail: "Sample preview gated",
    updatedAt: "2026-05-10T12:40:00.000Z",
    severity: "warning",
    nextAction: "Approve listing copy",
  },
  {
    moduleKey: "catalogue",
    recordType: "sample_preview_access",
    id: "pa_01J2PREVIEW",
    title: "Retail receipts private listing",
    state: "nda_acknowledged",
    detail: "Iberian Retail · private",
    updatedAt: "2026-05-10T12:35:00.000Z",
    severity: "warning",
    nextAction: "Review preview gate",
  },
  {
    moduleKey: "commercials",
    recordType: "payout",
    id: "py_01J2SUPPLIER",
    title: "Supplier revenue-share payout",
    state: "held",
    detail: "Stripe test transfer hold",
    updatedAt: "2026-05-10T12:30:00.000Z",
    severity: "warning",
    nextAction: "Review payout hold",
  },
  {
    moduleKey: "operations",
    recordType: "run",
    id: "rn_01J2QA",
    title: "qa.scorecard.v2",
    state: "queued",
    detail: "Retry count 0",
    updatedAt: "2026-05-10T12:20:00.000Z",
    severity: "warning",
    nextAction: "Check worker queue",
  },
  {
    moduleKey: "audit",
    recordType: "audit_event",
    id: "ae_01STATE",
    title: "build state transition",
    state: "state_transition",
    detail: "build/bd_01J2RECEIPTS",
    updatedAt: "2026-05-10T12:10:00.000Z",
    severity: "info",
    nextAction: "Open audit overlay",
  },
  {
    moduleKey: "settings",
    recordType: "signing_key",
    id: "sk_01J2ACTIVE",
    title: "Delivery signing key",
    state: "active",
    detail: "Ed25519",
    updatedAt: "2026-05-10T12:00:00.000Z",
    severity: "info",
    nextAction: "Schedule rotation",
  },
];

export function groupWorkItems(
  rows: OperatorWorkItem[]
): Record<OperatorModuleKey, OperatorWorkItem[]> {
  return Object.fromEntries(
    operatorModuleKeys.map((key) => [
      key,
      rows.filter((row) => row.moduleKey === key),
    ])
  ) as Record<OperatorModuleKey, OperatorWorkItem[]>;
}

export function getOperatorConsoleSnapshot(): OperatorConsoleSnapshot {
  const composed = composeLicenseGrants(licenseGrants);
  const requestedUse = evaluateRequestedUse(composed, {
    train: true,
    commercialInference: true,
    geo: ["WW"],
  });

  return {
    generatedAt: "2026-05-10T14:45:00.000Z",
    modules: operatorModuleSummaries,
    triage: {
      blockers: 6,
      overdueGates: 3,
      releasesThisWeek: 2,
      queuedJobs: 11,
    },
    builds: demoBuilds,
    featuredBuild: demoBuilds[0],
    licensePreview: {
      composed,
      requestedUseAllowed: requestedUse.allowed,
      requestedUseReasons: requestedUse.allowed ? [] : requestedUse.reasons,
    },
    workflowCoverage: Object.fromEntries(
      Object.entries(workflowDefinitions).map(([workflow, definition]) => [
        workflow,
        [...definition.states],
      ])
    ) as Record<WorkflowName, string[]>,
    workItems: groupWorkItems(fixtureWorkItems),
    lineageEvents: [
      {
        id: "le_01INTAKE",
        namespace: "marquez/caudals",
        jobName: "intake.receipts.v3",
        datasetVersionId: "dv_01RECEIPTSV3",
        emittedAt: "2026-05-10T10:10:00.000Z",
      },
      {
        id: "le_02CLEAN",
        namespace: "marquez/caudals",
        jobName: "clean.normalize_receipts",
        datasetVersionId: "dv_01RECEIPTSV3",
        emittedAt: "2026-05-10T11:30:00.000Z",
      },
      {
        id: "le_03QA",
        namespace: "marquez/caudals",
        jobName: "qa.scorecard.v2",
        datasetVersionId: "dv_01RECEIPTSV3",
        emittedAt: "2026-05-10T13:05:00.000Z",
      },
    ],
    auditRows: [
      {
        id: "ae_01STATE",
        actor: "ops.lead@caudals.com",
        action: "state_transition",
        target: "build/bd_01J2RECEIPTS qa",
        createdAt: "2026-05-10T13:08:00.000Z",
      },
      {
        id: "ae_02RIGHTS",
        actor: "privacy@caudals.com",
        action: "license_composition_blocked",
        target: "build_plan/bp_01J2RECEIPTS commercial inference",
        createdAt: "2026-05-10T12:45:00.000Z",
      },
      {
        id: "ae_03QA",
        actor: "qa@caudals.com",
        action: "qa_exception_opened",
        target: "qa_report/qr_01J2RECEIPTS duplicate cluster",
        createdAt: "2026-05-10T12:12:00.000Z",
      },
    ],
  };
}
