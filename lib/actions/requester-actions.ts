'use server';

// Placeholder server actions for requester flows. These return simple defaults so
// the UI can render while backend wiring is completed.

export type DatasetListFilters = {
  search?: string;
  quickFilter?: "needs_funding" | "pending_review" | "download_ready" | "drafts";
  status?: string[];
  page?: number;
  perPage?: number;
};

export type DatasetListItem = {
  id: string;
  title: string;
  status: string;
  approval_status: string;
  reward_amount: number | null;
  data_type: string;
  samples_collected: number;
  samples_needed: number;
  total_budget: number | null;
  paid_amount: number | null;
  pendingSubmissions: number;
  latestExport?: { status?: string | null } | null;
  [key: string]: unknown;
};

export async function getRequesterDatasets(
  filters: DatasetListFilters
): Promise<{ items: DatasetListItem[]; total: number; perPage: number } | { error: string }> {
  return {
    items: [],
    total: 0,
    perPage: filters.perPage ?? 10,
  };
}

export async function updateDatasetStatus(
  _id: string,
  _status: "paused" | "active" | "archived"
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function duplicateDataset(
  _id: string
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function requestDatasetExport(
  _datasetId: string
): Promise<{ id: string } | { error: string }> {
  return { id: "export-id" };
}

export async function generateSignedExportUrl(
  _exportId: string
): Promise<{ url: string } | { error: string }> {
  return { url: "#" };
}

export async function saveAutomationConfig(
  _datasetId: string,
  _config: Record<string, unknown>
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function getDatasetExports(): Promise<
  Array<{
    id: string;
    dataset_request_id: string;
    status: string;
    export_type: string;
    created_at: string;
    completed_at: string | null;
    dataset_requests?: { title?: string } | null;
  }> | { error: string }
> {
  return [];
}

export async function getRequesterAnalytics(): Promise<
  | {
      timeseries: Array<{ date: string; submissions: number; approvals: number }>;
      submissions: Array<{ status: string; dataset?: { title?: string | null } | null; created_at?: string | null }>;
      datasets: Array<{ id: string; title: string; status?: string }>;
      categoryBreakdown: Record<string, number>;
    }
  | {
      error: string;
    }
> {
  return { timeseries: [], submissions: [], datasets: [], categoryBreakdown: {} };
}

export async function getRequesterOnboarding(): Promise<
  Array<{ id: string; label: string; status: "pending" | "in_progress" | "done"; completed_at: string | null }> | {
    error: string;
  }
> {
  return [
    { id: "profile", label: "Complete profile", status: "in_progress", completed_at: null },
    { id: "dataset", label: "Create dataset", status: "pending", completed_at: null },
    { id: "download", label: "Download data", status: "pending", completed_at: null },
  ];
}

export async function updateOnboardingStep(
  _stepId: string,
  _status: "pending" | "in_progress" | "done"
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function getDatasetTemplates(): Promise<
  Array<{ id: string; title: string; category?: string; data_type?: string; prompt?: string }> | { error: string }
> {
  return [];
}

export async function getRequesterDatasetDetail(
  _id: string
): Promise<
  | {
      id: string;
      title: string;
      status?: string;
      approval_status?: string;
      reward_amount?: number;
      data_type?: string;
      samples_collected?: number;
      samples_needed?: number;
      total_budget?: number | null;
      paid_amount?: number | null;
      pendingSubmissions?: number;
      latestExport?: { status?: string | null } | null;
      exports?: Array<{
        id: string;
        dataset_request_id: string;
        status: string;
        export_type: string;
        created_at: string;
        completed_at: string | null;
      }>;
      automation_config?: Record<string, unknown> | null;
      dataset?: {
        id: string;
        title: string;
        reward_amount?: number | null;
        data_type?: string | null;
        samples_needed?: number | null;
        samples_collected?: number | null;
      };
    }
  | { error: string }
> {
  return {
    id: _id,
    title: "Dataset",
    status: "draft",
    approval_status: "pending",
    reward_amount: 0,
    data_type: "",
    samples_collected: 0,
    samples_needed: 0,
    total_budget: 0,
    paid_amount: 0,
    pendingSubmissions: 0,
    latestExport: null,
    exports: [],
    automation_config: {},
    dataset: {
      id: _id,
      title: "Dataset",
      reward_amount: 0,
      data_type: "",
      samples_needed: 0,
      samples_collected: 0,
    },
  };
}

export async function getRequesterBillingOverview(): Promise<
  | {
      wallet: {
        balance?: number;
        reserved?: number;
        available_balance?: number;
        pending_balance?: number;
      };
      history: Array<{ id: string; amount: number; type: string; created_at: string }>;
      invoices: Array<{ id: string; amount: number; status: string; issued_at: string }>;
      transactions: Array<{
        id: string;
        amount: number;
        type: string;
        status?: string;
        direction?: "debit" | "credit";
        created_at: string;
      }>;
    }
  | { error: string }
> {
  return {
    wallet: { balance: 0, reserved: 0, available_balance: 0, pending_balance: 0 },
    history: [],
    invoices: [],
    transactions: [],
  };
}

export async function getOrgSettings(): Promise<{
  company_name: string | null;
  contact_email: string | null;
  tax_id: string | null;
  billing_address?: string | null;
  default_currency: string | null;
}> {
  return {
    company_name: null,
    contact_email: null,
    tax_id: null,
    billing_address: null,
    default_currency: null,
  };
}

export async function saveOrgSettings(
  _input: Record<string, unknown>
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function getRequesterApiKeys(): Promise<
  | Array<{
      id: string;
      name: string;
      created_at: string;
      revoked_at: string | null;
      last_used_at?: string | null;
    }>
  | { error: string }
> {
  return [];
}

export async function generateRequesterApiKey(
  _label?: string
): Promise<{ data: { apiKey: string } } | { error: string }> {
  return { data: { apiKey: "req_api_key_placeholder" } };
}

export async function revokeRequesterApiKey(
  _id: string
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function getSupportTickets(): Promise<
  Array<{ id: string; subject: string; status: string; created_at: string }> | { error: string }
> {
  return [];
}

export async function createSupportTicket(
  _input: Record<string, unknown>
): Promise<{ ok: true } | { error: string }> {
  return { ok: true };
}

export async function getRequesterDashboardData(): Promise<
  | {
      stats: {
        datasetCounts: Record<string, number>;
        submissions: { pending: number; approved: number; rejected: number; needsChanges: number };
        funding: { totalBudget: number; totalFunded: number; totalSpent: number; walletBalance: number };
        exports: { ready: number; processing: number };
        pendingActions: Array<{ id: string; title: string; type: "review" | "funding" | "deadline"; dueAt?: string | null }>;
      };
      chart: Array<{ date: string; submissions: number; approvals: number }>;
      onboarding: Array<{ id: string; label: string; status: "pending" | "in_progress" | "done"; completed_at: string | null }>;
      notifications: Array<{
        id: string;
        type: "review_backlog" | "low_budget" | "export_ready";
        severity: "info" | "warning" | "critical";
        datasetTitle?: string | null;
        pendingCount?: number;
        fundedPercentage?: number;
        exportId?: string;
      }>;
    }
  | { error: string }
> {
  const onboarding = await getRequesterOnboarding();

  return {
    stats: {
      datasetCounts: { active: 0, draft: 0 },
      submissions: { pending: 0, approved: 0, rejected: 0, needsChanges: 0 },
      funding: { totalBudget: 0, totalFunded: 0, totalSpent: 0, walletBalance: 0 },
      exports: { ready: 0, processing: 0 },
      pendingActions: [],
    },
    chart: [],
    onboarding: Array.isArray(onboarding) ? onboarding : [],
    notifications: [],
  };
}
