export type WorkflowName =
  | "buyer_opportunity"
  | "supplier_opportunity"
  | "build"
  | "run"
  | "label_batch"
  | "contract"
  | "delivery"
  | "dsar"
  | "sample_preview_access";

export type WorkflowTransition = {
  from: string;
  to: string;
  label?: string;
};

export type WorkflowDefinition = {
  name: WorkflowName;
  states: readonly string[];
  terminalStates: readonly string[];
  transitions: readonly WorkflowTransition[];
};

export type TransitionCheck =
  | {
      ok: true;
      transition: WorkflowTransition;
    }
  | {
      ok: false;
      reason: string;
    };

export type TransitionAuditEvent = {
  action: "state_transition";
  target_type: WorkflowName;
  target_id: string;
  metadata: {
    from_state: string;
    to_state: string;
    reason?: string;
  };
};

export const workflowRecordTypeMap = {
  buyer_opportunity: "buyer_opportunity",
  supplier_opportunity: "supplier_opportunity",
  build: "build",
  run: "run",
  label_batch: "label_batch",
  contract: "contract",
  delivery: "delivery",
  dsar: "dsar",
  dsar_request: "dsar",
  sample_preview_access: "sample_preview_access",
} as const satisfies Record<string, WorkflowName>;

function chainTransitions(states: readonly string[]): WorkflowTransition[] {
  return states.slice(0, -1).map((from, index) => ({
    from,
    to: states[index + 1],
  }));
}

const buyerOpportunityStates = [
  "new",
  "qualifying",
  "scoping",
  "feasibility",
  "pilot_quoted",
  "pilot_active",
  "pilot_delivered",
  "full_quoted",
  "full_active",
  "delivered",
] as const;

const supplierOpportunityStates = [
  "new",
  "qualifying",
  "nda_signed",
  "sample_received",
  "feasibility_done",
  "pilot_active",
  "pilot_done",
  "full_active",
  "live",
] as const;

const buildStates = [
  "planned",
  "intaking",
  "profiling",
  "cleaning",
  "privacy",
  "enriching",
  "labeling",
  "qa",
  "packaging",
  "released",
  "delivered",
] as const;

export const workflowDefinitions = {
  buyer_opportunity: {
    name: "buyer_opportunity",
    states: [
      ...buyerOpportunityStates,
      "on_subscription",
      "closed_won",
      "closed_lost",
    ],
    terminalStates: ["on_subscription", "closed_won", "closed_lost"],
    transitions: [
      ...chainTransitions(buyerOpportunityStates),
      { from: "delivered", to: "on_subscription" },
      { from: "delivered", to: "closed_won" },
      { from: "new", to: "closed_lost" },
      { from: "qualifying", to: "closed_lost" },
      { from: "scoping", to: "closed_lost" },
      { from: "feasibility", to: "closed_lost" },
      { from: "pilot_quoted", to: "closed_lost" },
      { from: "full_quoted", to: "closed_lost" },
    ],
  },
  supplier_opportunity: {
    name: "supplier_opportunity",
    states: [...supplierOpportunityStates, "paused", "terminated"],
    terminalStates: ["terminated"],
    transitions: [
      ...chainTransitions(supplierOpportunityStates),
      { from: "live", to: "paused" },
      { from: "paused", to: "live" },
      { from: "new", to: "terminated" },
      { from: "qualifying", to: "terminated" },
      { from: "nda_signed", to: "terminated" },
      { from: "sample_received", to: "terminated" },
      { from: "feasibility_done", to: "terminated" },
      { from: "pilot_active", to: "terminated" },
      { from: "pilot_done", to: "terminated" },
      { from: "full_active", to: "terminated" },
      { from: "live", to: "terminated" },
      { from: "paused", to: "terminated" },
    ],
  },
  build: {
    name: "build",
    states: [...buildStates, "rework"],
    terminalStates: ["delivered"],
    transitions: [
      ...chainTransitions(buildStates),
      { from: "qa", to: "rework", label: "qa_failed" },
      { from: "rework", to: "cleaning", label: "re_enter_cleaning" },
      { from: "rework", to: "privacy", label: "re_enter_privacy" },
      { from: "rework", to: "enriching", label: "re_enter_enriching" },
      { from: "rework", to: "labeling", label: "re_enter_labeling" },
    ],
  },
  run: {
    name: "run",
    states: ["queued", "running", "succeeded", "failed", "cancelled"],
    terminalStates: ["succeeded", "failed", "cancelled"],
    transitions: [
      { from: "queued", to: "running" },
      { from: "queued", to: "cancelled" },
      { from: "running", to: "succeeded" },
      { from: "running", to: "failed" },
      { from: "running", to: "cancelled" },
      { from: "failed", to: "queued", label: "retry" },
    ],
  },
  label_batch: {
    name: "label_batch",
    states: ["queued", "in_review", "in_adjudication", "closed", "requeued"],
    terminalStates: ["closed"],
    transitions: [
      { from: "queued", to: "in_review" },
      { from: "in_review", to: "in_adjudication" },
      { from: "in_review", to: "closed" },
      { from: "in_adjudication", to: "closed" },
      { from: "in_review", to: "requeued" },
      { from: "in_adjudication", to: "requeued" },
      { from: "requeued", to: "queued" },
    ],
  },
  contract: {
    name: "contract",
    states: [
      "drafting",
      "awaiting_buyer",
      "awaiting_supplier",
      "signed",
      "active",
      "renewed",
      "terminated",
    ],
    terminalStates: ["terminated"],
    transitions: [
      { from: "drafting", to: "awaiting_buyer" },
      { from: "drafting", to: "awaiting_supplier" },
      { from: "awaiting_buyer", to: "awaiting_supplier" },
      { from: "awaiting_supplier", to: "awaiting_buyer" },
      { from: "awaiting_buyer", to: "signed" },
      { from: "awaiting_supplier", to: "signed" },
      { from: "signed", to: "active" },
      { from: "active", to: "renewed" },
      { from: "renewed", to: "active" },
      { from: "drafting", to: "terminated" },
      { from: "awaiting_buyer", to: "terminated" },
      { from: "awaiting_supplier", to: "terminated" },
      { from: "signed", to: "terminated" },
      { from: "active", to: "terminated" },
      { from: "renewed", to: "terminated" },
    ],
  },
  delivery: {
    name: "delivery",
    states: [
      "scheduled",
      "preparing",
      "ready",
      "sent",
      "downloaded",
      "accepted",
      "disputed",
    ],
    terminalStates: ["accepted", "disputed"],
    transitions: [
      { from: "scheduled", to: "preparing" },
      { from: "preparing", to: "ready" },
      { from: "ready", to: "sent" },
      { from: "sent", to: "downloaded" },
      { from: "downloaded", to: "accepted" },
      { from: "downloaded", to: "disputed" },
    ],
  },
  dsar: {
    name: "dsar",
    states: [
      "received",
      "identity_verified",
      "impact_assessed",
      "propagating",
      "completed",
    ],
    terminalStates: ["completed"],
    transitions: [
      { from: "received", to: "identity_verified" },
      { from: "identity_verified", to: "impact_assessed" },
      { from: "impact_assessed", to: "propagating" },
      { from: "propagating", to: "completed" },
    ],
  },
  sample_preview_access: {
    name: "sample_preview_access",
    states: [
      "requested",
      "nda_acknowledged",
      "approved",
      "denied",
      "revoked",
      "expired",
    ],
    terminalStates: ["denied", "revoked", "expired"],
    transitions: [
      { from: "requested", to: "nda_acknowledged" },
      { from: "requested", to: "denied" },
      { from: "nda_acknowledged", to: "approved" },
      { from: "nda_acknowledged", to: "denied" },
      { from: "approved", to: "revoked" },
      { from: "approved", to: "expired" },
      { from: "denied", to: "requested", label: "reopen" },
      { from: "revoked", to: "requested", label: "reopen" },
    ],
  },
} satisfies Record<WorkflowName, WorkflowDefinition>;

export function getWorkflowDefinition(name: WorkflowName): WorkflowDefinition {
  return workflowDefinitions[name];
}

export function isWorkflowState(
  workflow: WorkflowName,
  state: string
): boolean {
  return workflowDefinitions[workflow].states.includes(state);
}

export function isTerminalWorkflowState(
  workflow: WorkflowName,
  state: string
): boolean {
  return workflowDefinitions[workflow].terminalStates.includes(state);
}

export function getWorkflowNameForRecordType(
  recordType: string
): WorkflowName | null {
  return workflowRecordTypeMap[
    recordType as keyof typeof workflowRecordTypeMap
  ] ?? null;
}

export function getNextWorkflowTransitions(
  workflow: WorkflowName,
  fromState: string
): WorkflowTransition[] {
  return workflowDefinitions[workflow].transitions.filter(
    (transition) => transition.from === fromState
  );
}

export function checkTransition(
  workflow: WorkflowName,
  fromState: string,
  toState: string
): TransitionCheck {
  const definition = workflowDefinitions[workflow];

  if (!definition.states.includes(fromState)) {
    return {
      ok: false,
      reason: `"${fromState}" is not a valid ${workflow} state`,
    };
  }

  if (!definition.states.includes(toState)) {
    return {
      ok: false,
      reason: `"${toState}" is not a valid ${workflow} state`,
    };
  }

  const transition = definition.transitions.find(
    (candidate) => candidate.from === fromState && candidate.to === toState
  );

  if (!transition) {
    return {
      ok: false,
      reason: `${workflow} cannot transition from ${fromState} to ${toState}`,
    };
  }

  return {
    ok: true,
    transition,
  };
}

export function assertTransition(
  workflow: WorkflowName,
  fromState: string,
  toState: string
): WorkflowTransition {
  const check = checkTransition(workflow, fromState, toState);

  if (!check.ok) {
    throw new Error(check.reason);
  }

  return check.transition;
}

export function buildTransitionAuditEvent(input: {
  workflow: WorkflowName;
  targetId: string;
  fromState: string;
  toState: string;
  reason?: string;
}): TransitionAuditEvent {
  assertTransition(input.workflow, input.fromState, input.toState);

  return {
    action: "state_transition",
    target_type: input.workflow,
    target_id: input.targetId,
    metadata: {
      from_state: input.fromState,
      to_state: input.toState,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  };
}
