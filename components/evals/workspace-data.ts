"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { evalRequest } from "./api";
import { t } from "@/lib/evals/messages/en";

export type WorkspaceEvaluation = {
  id: string;
  title: string;
  project_id: string;
  project_title: string;
  project_description: string;
  latest_source_id: string | null;
  latest_source_revision_id: string | null;
  source_ids?: string[];
  preparation_status: string;
  reason_code: string | null;
  selected_suite_version_id: string | null;
  selected_target_id?: string | null;
  commercial_cap: string;
  currency: string;
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_run_phase: string | null;
  latest_run_created_at?: string | null;
  latest_run_execution_mode?: string | null;
  latest_run_reason_code?: string | null;
  run_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type WorkspaceSystem = {
  id: string;
  project_id: string;
  title: string;
  target_revision_id: string;
  document: { kind: string };
  connection_status: string | null;
  runner_status: string | null;
  runner_id: string | null;
  error_code: string | null;
  created_at?: string;
  connection_checked_at?: string | null;
};

export type WorkspaceReport = {
  id: string;
  title: string;
  current_revision_id: string;
  evaluation_id: string;
  updated_at?: string;
  revision_created_at?: string;
  system_name?: string | null;
  review_status?: string | null;
  headline_status?: string | null;
  strict_pass_rate?: number | null;
  n_pass?: number | null;
  n_scorable?: number | null;
  n_eligible?: number | null;
};

export type WorkspaceSummary = {
  evaluations: WorkspaceEvaluation[];
  systems: WorkspaceSystem[];
  reports: WorkspaceReport[];
  entitlement: {
    max_active_runs: number;
    monthly_spend_limit: string;
    currency: string;
    allowed_connection_types: string[];
    can_export: boolean;
    can_schedule: boolean;
  };
  usage: { settled: string; outstanding: string };
  preferences: { completion: boolean; required_input: boolean; failure: boolean; email: boolean };
};

const IN_FLIGHT = new Set([
  "checking_connection",
  "ingesting",
  "profiling",
  "generating",
  "validating",
  "queued",
  "running",
  "pause_requested",
  "cancel_requested",
]);

/**
 * The customer-safe workspace projection. It refreshes quickly while anything
 * is in flight and slowly otherwise, so progress stays live without polling a
 * quiet workspace every few seconds.
 */
export function useWorkspaceSummary(orgId: string) {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (!orgId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const value = await evalRequest<WorkspaceSummary>(`/workspace/summary?orgId=${encodeURIComponent(orgId)}`);
      busy.current = value.evaluations.some(
        (item) => IN_FLIGHT.has(item.preparation_status) || (item.latest_run_status != null && IN_FLIGHT.has(item.latest_run_status)),
      );
      setSummary(value);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setSummary(null);
    setError("");
    setLoading(Boolean(orgId));
    let timer = window.setTimeout(function tick() {
      void reload().finally(() => {
        timer = window.setTimeout(tick, busy.current ? 5_000 : 30_000);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orgId, reload]);

  const retry = useCallback(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { summary, error, reload, retry, loading };
}

export function connectionLabel(kind: string) {
  switch (kind) {
    case "website":
      return t("websiteChatbot");
    case "openai_compatible":
    case "provider_native":
    case "https_json":
      return t("apiSystem");
    case "imported_responses":
      return t("uploadAnswers");
    case "private_runner":
      return t("privateSystem");
    default:
      return kind.replaceAll("_", " ");
  }
}
