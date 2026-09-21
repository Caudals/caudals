type RecordValue = Record<string, unknown>;
type Summary = {
  evaluations: RecordValue[];
  systems: RecordValue[];
  reports: RecordValue[];
  entitlement: RecordValue;
  usage: RecordValue;
  preferences: RecordValue;
};

export function customerWorkspaceView(value: Summary) {
  return {
    evaluations: value.evaluations.map((item) => ({
      id: item.id,
      title: item.title,
      project_id: item.project_id,
      project_title: item.project_title,
      project_description: item.project_description,
      latest_source_id: item.latest_source_id,
      latest_source_revision_id: item.latest_source_revision_id,
      preparation_status: item.preparation_status,
      reason_code: item.reason_code,
      selected_suite_version_id: item.selected_suite_version_id,
      commercial_cap: item.commercial_cap,
      currency: item.currency,
      latest_run_id: item.latest_run_id,
      latest_run_status: item.latest_run_status,
      latest_run_phase: item.latest_run_phase,
    })),
    systems: value.systems.map((item) => ({
      id: item.id,
      project_id: item.project_id,
      title: item.title,
      target_revision_id: item.target_revision_id,
      document: { kind: (item.document as RecordValue | null)?.kind },
      connection_status: item.connection_status,
      runner_status: item.runner_status,
      runner_id: item.runner_id,
      error_code: item.error_code,
    })),
    reports: value.reports.map((item) => ({
      id: item.id,
      title: item.title,
      current_revision_id: item.current_revision_id,
      evaluation_id: item.evaluation_id,
    })),
    entitlement: {
      max_active_runs: value.entitlement.max_active_runs,
      monthly_spend_limit: value.entitlement.monthly_spend_limit,
      currency: value.entitlement.currency,
      allowed_connection_types: value.entitlement.allowed_connection_types,
      can_export: value.entitlement.can_export,
      can_schedule: value.entitlement.can_schedule,
    },
    usage: {
      settled: value.usage.settled,
      outstanding: value.usage.outstanding,
    },
    preferences: {
      completion: value.preferences.completion,
      required_input: value.preferences.required_input,
      failure: value.preferences.failure,
      email: value.preferences.email,
    },
  };
}
