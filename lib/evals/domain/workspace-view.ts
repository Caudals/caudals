type RecordValue = Record<string, unknown>;
type Summary = {
  evaluations: RecordValue[];
  systems: RecordValue[];
  reports: RecordValue[];
  entitlement: RecordValue;
  usage: RecordValue;
  preferences: RecordValue;
  next_run?: RecordValue | null;
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
      source_ids: item.source_ids,
      preparation_status: item.preparation_status,
      reason_code: item.reason_code,
      selected_suite_version_id: item.selected_suite_version_id,
      selected_target_id: item.selected_target_id,
      commercial_cap: item.commercial_cap,
      currency: item.currency,
      latest_run_id: item.latest_run_id,
      latest_run_status: item.latest_run_status,
      latest_run_phase: item.latest_run_phase,
      latest_run_created_at: item.latest_run_created_at,
      latest_run_execution_mode: item.latest_run_execution_mode,
      latest_run_reason_code: item.latest_run_reason_code,
      run_count: item.run_count,
      created_at: item.created_at,
      updated_at: item.updated_at,
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
      created_at: item.created_at,
      connection_checked_at: item.connection_checked_at,
      // Health columns (launch L-22): last successful check, a private runner's last contact.
      connection_ok_at: item.connection_ok_at,
      runner_seen_at: item.runner_seen_at,
    })),
    reports: value.reports.map((item) => ({
      id: item.id,
      title: item.title,
      current_revision_id: item.current_revision_id,
      evaluation_id: item.evaluation_id,
      run_id: item.run_id,
      target_id: item.target_id,
      run_created_at: item.run_created_at,
      updated_at: item.updated_at,
      revision_created_at: item.revision_created_at,
      system_name: item.system_name,
      review_status: item.review_status,
      headline_status: item.headline_status,
      strict_pass_rate: item.strict_pass_rate,
      n_pass: item.n_pass,
      n_scorable: item.n_scorable,
      n_eligible: item.n_eligible,
    })),
    entitlement: {
      // The plan decides the review mode (launch L-22), is shown on Home and with its caps in
      // Settings → General (launch L-15: plan and limits, never money).
      plan: value.entitlement.plan,
      max_systems: value.entitlement.max_systems,
      max_tests_per_set: value.entitlement.max_tests_per_set,
      max_runs_per_month: value.entitlement.max_runs_per_month,
      max_members: value.entitlement.max_members,
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
    next_run: value.next_run
      ? {
          id: value.next_run.id,
          evaluation_id: value.next_run.evaluation_id,
          evaluation_title: value.next_run.evaluation_title,
          next_due_at: value.next_run.next_due_at,
          cadence: value.next_run.cadence,
          timezone: value.next_run.timezone,
        }
      : null,
  };
}
