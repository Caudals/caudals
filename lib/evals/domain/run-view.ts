type RunRead = {
  run: Record<string, unknown>;
  units: Array<Record<string, unknown>>;
  targetUsage?: { calls: number; unknown: number };
  [key: string]: unknown;
};

export function customerRunView(value: RunRead) {
  const run = value.run;
  return {
    run: {
      id: run.id,
      status: run.status,
      phase: run.phase,
      execution_mode: run.execution_mode,
      suite_version_id: run.suite_version_id,
      created_at: run.created_at,
      reason_code: run.reason_code,
    },
    units: value.units.map((unit) => ({ id: unit.id, status: unit.status })),
    targetUsage: {
      calls: value.targetUsage?.calls ?? 0,
      unknown: value.targetUsage?.unknown ?? 0,
    },
  };
}
