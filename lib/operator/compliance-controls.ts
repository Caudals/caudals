export const complianceControlStates = [
  "draft",
  "scoped",
  "evidence_review",
  "ready",
  "exception",
  "deferred",
  "retired",
] as const;

export type ComplianceControlState = (typeof complianceControlStates)[number];

export type ComplianceControlScope = {
  frameworkMappings?: Record<string, unknown> | null;
  scopeBoundary?: string | null;
  ownerOperatorId?: string | null;
  evidenceSources?: unknown[] | null;
  linkedRecords?: unknown[] | null;
  implementationStatus?: string | null;
  nextReviewAt?: string | null;
  approvedAt?: string | null;
};

export function isComplianceControlScopingEnabled() {
  return process.env.COMPLIANCE_CONTROL_SCOPING_ENABLED !== "false";
}

export function validateComplianceControlScope(
  control: ComplianceControlScope,
  state: ComplianceControlState
) {
  const missing: string[] = [];
  const scopedStates = new Set<ComplianceControlState>([
    "scoped",
    "evidence_review",
    "ready",
    "exception",
  ]);

  if (!isComplianceControlScopingEnabled()) {
    missing.push("feature_flag");
  }

  if (!scopedStates.has(state)) {
    return {
      ok: missing.length === 0,
      missing,
    };
  }

  if (!control.scopeBoundary || control.scopeBoundary.trim().length < 6) {
    missing.push("scope_boundary");
  }

  if (!control.ownerOperatorId) {
    missing.push("owner_operator_id");
  }

  if (!control.frameworkMappings?.soc2) {
    missing.push("framework_mappings.soc2");
  }

  if (!control.frameworkMappings?.iso27001) {
    missing.push("framework_mappings.iso27001");
  }

  if (!control.evidenceSources?.length) {
    missing.push("evidence_sources");
  }

  if (!control.linkedRecords?.length) {
    missing.push("linked_records");
  }

  if (state === "ready") {
    if (control.implementationStatus !== "implemented") {
      missing.push("implementation_status");
    }

    if (!control.nextReviewAt) {
      missing.push("next_review_at");
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
