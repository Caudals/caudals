import {
  composeLicenseGrants,
  evaluateRequestedUse,
  type ComposedLicense,
  type LicenseGrant,
} from "@/lib/operator/license-composition";
import { workflowDefinitions, type WorkflowName } from "@/lib/operator/workflows";

export type OperatorModuleKey =
  | "pipeline"
  | "leads"
  | "suppliers"
  | "buyers"
  | "builds"
  | "datasets"
  | "quality"
  | "privacy"
  | "catalogue"
  | "commercials"
  | "operations"
  | "audit"
  | "settings";

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
    description: "Organizations, contacts, briefs, sample reviews, and deliveries.",
    anchorRecords: ["organization", "contact", "dataset_brief", "delivery"],
    totalRecords: 24,
    blockedRecords: 3,
    savedViews: ["New briefs", "Awaiting samples", "Delivery risk"],
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
    description: "Dataset families, versions, manifests, lineage, and sample previews.",
    anchorRecords: ["dataset", "dataset_version", "lineage_event"],
    totalRecords: 12,
    blockedRecords: 1,
    savedViews: ["Released", "Lineage gaps", "Needs card"],
  },
  {
    key: "quality",
    title: "Quality",
    description: "QA reports, scorecards, exceptions, bias panels, and label batches.",
    anchorRecords: ["qa_report", "label_batch"],
    totalRecords: 29,
    blockedRecords: 5,
    savedViews: ["Exceptions", "Adjudication", "Buyer scorecards"],
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
    description: "Operator-managed listings, pricing, exclusivity, and private offers.",
    anchorRecords: ["catalogue_listing", "private_offer", "quote"],
    totalRecords: 9,
    blockedRecords: 1,
    savedViews: ["Draft listings", "Private offers", "Pricing review"],
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
