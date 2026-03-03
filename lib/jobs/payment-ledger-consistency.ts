import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
type TransactionDirection = "credit" | "debit";
type TransactionStatus = "pending" | "completed" | "failed" | "cancelled";
type TransactionType =
  | "wallet_deposit"
  | "wallet_withdrawal"
  | "dataset_funding"
  | "submission_payout"
  | "platform_fee"
  | "stripe_adjustment"
  | "refund";

type LedgerTransactionRow = {
  id: string;
  user_id: string;
  direction: TransactionDirection;
  type: TransactionType;
  amount: number | null;
  net_amount: number | null;
  currency: string | null;
  status: TransactionStatus;
  dataset_request_id: string | null;
  submission_id: string | null;
  created_at: string;
};

type WalletRow = {
  id: string;
  user_id: string;
  available_balance: number | null;
  pending_balance: number | null;
  currency: string | null;
};

type DatasetRow = {
  id: string;
  total_budget: number | null;
  reward_amount: number | null;
  samples_needed: number | null;
  paid_amount: number | null;
  payment_status: PaymentStatus | null;
};

type DriftIssueCode =
  | "wallet_missing"
  | "wallet_balance_mismatch"
  | "wallet_unbacked_balance"
  | "dataset_paid_amount_mismatch"
  | "dataset_payment_status_mismatch"
  | "dataset_budget_overrun"
  | "tx_dataset_reference_missing"
  | "tx_submission_reference_missing";

type DriftSeverity = "high" | "medium" | "low";

export type PaymentLedgerDriftIssue = {
  code: DriftIssueCode;
  severity: DriftSeverity;
  message: string;
  userId: string | null;
  datasetId: string | null;
  walletId: string | null;
  transactionId: string | null;
  expected: string | null;
  actual: string | null;
};

export type PaymentLedgerConsistencyReport = {
  checkedAt: string;
  totals: {
    transactionsChecked: number;
    completedTransactionsChecked: number;
    walletsChecked: number;
    datasetsChecked: number;
    issueCount: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
  };
  issues: PaymentLedgerDriftIssue[];
};

type RepairOptions = {
  dryRun?: boolean;
  repairMissingWallets?: boolean;
  repairWalletBalances?: boolean;
  repairDatasetPaidAmount?: boolean;
  repairDatasetPaymentStatus?: boolean;
};

export type PaymentLedgerRepairSummary = {
  appliedAt: string;
  dryRun: boolean;
  actions: {
    walletsCreated: number;
    walletBalancesUpdated: number;
    datasetPaidAmountsUpdated: number;
    datasetStatusesUpdated: number;
  };
  before: PaymentLedgerConsistencyReport;
  after: PaymentLedgerConsistencyReport;
};

type ConsistencyState = {
  transactions: LedgerTransactionRow[];
  completedTransactions: LedgerTransactionRow[];
  wallets: WalletRow[];
  datasets: DatasetRow[];
  issues: PaymentLedgerDriftIssue[];
  expectedWalletByUser: Map<string, number>;
  preferredWalletCurrencyByUser: Map<string, string>;
  expectedFundingByDataset: Map<string, number>;
  expectedPaymentStatusByDataset: Map<string, PaymentStatus>;
  datasetsWithLedgerActivity: Set<string>;
};

function normalizeCents(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed);
}

function centsToDollars(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function dollarsToCents(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
}

function deriveDatasetBudgetCents(dataset: DatasetRow) {
  const explicitBudget = dollarsToCents(dataset.total_budget ?? 0);
  if (explicitBudget > 0) {
    return explicitBudget;
  }

  const derivedBudget = Math.round(
    Number(dataset.reward_amount ?? 0) * Number(dataset.samples_needed ?? 0) * 100
  );
  return Math.max(0, derivedBudget);
}

function derivePaymentStatus(totalBudgetCents: number, fundedCents: number): PaymentStatus {
  if (totalBudgetCents <= 0) {
    return "partial";
  }

  if (fundedCents >= totalBudgetCents) {
    return "paid";
  }

  if (fundedCents > 0) {
    return "partial";
  }

  return "unpaid";
}

async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function loadTransactions(adminClient: any) {
  return fetchAllRows<LedgerTransactionRow>((from, to) =>
    adminClient
      .from("transactions")
      .select(
        "id,user_id,direction,type,amount,net_amount,currency,status,dataset_request_id,submission_id,created_at"
      )
      .order("created_at", { ascending: true })
      .range(from, to)
  );
}

async function loadWallets(adminClient: any) {
  return fetchAllRows<WalletRow>((from, to) =>
    adminClient
      .from("wallets")
      .select("id,user_id,available_balance,pending_balance,currency")
      .order("created_at", { ascending: true })
      .range(from, to)
  );
}

async function loadDatasets(adminClient: any) {
  return fetchAllRows<DatasetRow>((from, to) =>
    adminClient
      .from("dataset_requests")
      .select("id,total_budget,reward_amount,samples_needed,paid_amount,payment_status")
      .order("created_at", { ascending: true })
      .range(from, to)
  );
}

function buildConsistencyState(input: {
  transactions: LedgerTransactionRow[];
  wallets: WalletRow[];
  datasets: DatasetRow[];
}) {
  const issues: PaymentLedgerDriftIssue[] = [];

  const completedTransactions = input.transactions.filter(
    (row) => row.status === "completed"
  );

  const expectedWalletByUser = new Map<string, number>();
  const preferredWalletCurrencyByUser = new Map<string, string>();

  for (const row of completedTransactions) {
    const delta = normalizeCents(row.net_amount ?? row.amount);
    const current = expectedWalletByUser.get(row.user_id) ?? 0;

    if (row.direction === "credit") {
      expectedWalletByUser.set(row.user_id, current + delta);
    } else {
      expectedWalletByUser.set(row.user_id, Math.max(0, current - delta));
    }

    if (!preferredWalletCurrencyByUser.has(row.user_id) && row.currency) {
      preferredWalletCurrencyByUser.set(row.user_id, String(row.currency).toLowerCase());
    }

    if (row.type === "dataset_funding" && !row.dataset_request_id) {
      issues.push({
        code: "tx_dataset_reference_missing",
        severity: "high",
        message:
          "Completed dataset_funding transaction is missing dataset_request_id reference.",
        userId: row.user_id,
        datasetId: null,
        walletId: null,
        transactionId: row.id,
        expected: "dataset_request_id to be non-null",
        actual: "null",
      });
    }

    if (row.type === "submission_payout") {
      if (!row.dataset_request_id) {
        issues.push({
          code: "tx_dataset_reference_missing",
          severity: "high",
          message:
            "Completed submission_payout transaction is missing dataset_request_id reference.",
          userId: row.user_id,
          datasetId: null,
          walletId: null,
          transactionId: row.id,
          expected: "dataset_request_id to be non-null",
          actual: "null",
        });
      }

      if (!row.submission_id) {
        issues.push({
          code: "tx_submission_reference_missing",
          severity: "medium",
          message:
            "Completed submission_payout transaction is missing submission_id reference.",
          userId: row.user_id,
          datasetId: row.dataset_request_id,
          walletId: null,
          transactionId: row.id,
          expected: "submission_id to be non-null",
          actual: "null",
        });
      }
    }
  }

  const walletByUser = new Map(input.wallets.map((wallet) => [wallet.user_id, wallet]));

  for (const [userId, expectedBalance] of expectedWalletByUser.entries()) {
    const wallet = walletByUser.get(userId);

    if (!wallet) {
      issues.push({
        code: "wallet_missing",
        severity: "high",
        message:
          "User has completed transactions but no wallet record; wallet should be backfilled.",
        userId,
        datasetId: null,
        walletId: null,
        transactionId: null,
        expected: `wallet available_balance=${expectedBalance}`,
        actual: "wallet missing",
      });
      continue;
    }

    const actualBalance = normalizeCents(wallet.available_balance);
    if (actualBalance !== expectedBalance) {
      issues.push({
        code: "wallet_balance_mismatch",
        severity: "medium",
        message:
          "Wallet available_balance does not match replayed completed transaction ledger.",
        userId,
        datasetId: null,
        walletId: wallet.id,
        transactionId: null,
        expected: String(expectedBalance),
        actual: String(actualBalance),
      });
    }
  }

  for (const wallet of input.wallets) {
    if (expectedWalletByUser.has(wallet.user_id)) {
      continue;
    }

    const actualBalance = normalizeCents(wallet.available_balance);
    if (actualBalance !== 0) {
      issues.push({
        code: "wallet_unbacked_balance",
        severity: "low",
        message:
          "Wallet has non-zero balance but no completed transactions in ledger scope.",
        userId: wallet.user_id,
        datasetId: null,
        walletId: wallet.id,
        transactionId: null,
        expected: "0",
        actual: String(actualBalance),
      });
    }
  }

  const expectedFundingByDataset = new Map<string, number>();
  const datasetsWithLedgerActivity = new Set<string>();
  for (const row of completedTransactions) {
    if (
      (row.type !== "dataset_funding" && row.type !== "submission_payout") ||
      !row.dataset_request_id
    ) {
      continue;
    }

    datasetsWithLedgerActivity.add(row.dataset_request_id);

    if (row.type === "dataset_funding") {
      const current = expectedFundingByDataset.get(row.dataset_request_id) ?? 0;
      const delta = normalizeCents(row.net_amount ?? row.amount);
      expectedFundingByDataset.set(row.dataset_request_id, current + delta);
    }
  }

  const expectedPaymentStatusByDataset = new Map<string, PaymentStatus>();
  for (const dataset of input.datasets) {
    if (!datasetsWithLedgerActivity.has(dataset.id)) {
      continue;
    }

    const fundedCents = expectedFundingByDataset.get(dataset.id) ?? 0;
    const storedPaidAmountCents = dollarsToCents(dataset.paid_amount);
    const expectedStatus = derivePaymentStatus(
      deriveDatasetBudgetCents(dataset),
      fundedCents
    );
    expectedPaymentStatusByDataset.set(dataset.id, expectedStatus);

    if (storedPaidAmountCents !== fundedCents) {
      issues.push({
        code: "dataset_paid_amount_mismatch",
        severity: "high",
        message:
          "dataset_requests.paid_amount does not match completed dataset_funding transactions.",
        userId: null,
        datasetId: dataset.id,
        walletId: null,
        transactionId: null,
        expected: centsToDollars(fundedCents).toFixed(2),
        actual: centsToDollars(storedPaidAmountCents).toFixed(2),
      });
    }

    const actualStatus = dataset.payment_status ?? "unpaid";
    if (actualStatus !== expectedStatus) {
      issues.push({
        code: "dataset_payment_status_mismatch",
        severity: "medium",
        message:
          "dataset_requests.payment_status does not match funding-derived status.",
        userId: null,
        datasetId: dataset.id,
        walletId: null,
        transactionId: null,
        expected: expectedStatus,
        actual: actualStatus,
      });
    }

    const totalBudgetCents = deriveDatasetBudgetCents(dataset);
    if (totalBudgetCents > 0 && fundedCents > totalBudgetCents) {
      issues.push({
        code: "dataset_budget_overrun",
        severity: "medium",
        message: "Dataset funding ledger exceeds total budget.",
        userId: null,
        datasetId: dataset.id,
        walletId: null,
        transactionId: null,
        expected: centsToDollars(totalBudgetCents).toFixed(2),
        actual: centsToDollars(fundedCents).toFixed(2),
      });
    }
  }

  return {
    transactions: input.transactions,
    completedTransactions,
    wallets: input.wallets,
    datasets: input.datasets,
    issues,
    expectedWalletByUser,
    preferredWalletCurrencyByUser,
    expectedFundingByDataset,
    expectedPaymentStatusByDataset,
    datasetsWithLedgerActivity,
  } satisfies ConsistencyState;
}

function toConsistencyReport(state: ConsistencyState): PaymentLedgerConsistencyReport {
  const totals = state.issues.reduce(
    (acc, issue) => {
      acc.issueCount += 1;
      if (issue.severity === "high") {
        acc.highSeverityCount += 1;
      } else if (issue.severity === "medium") {
        acc.mediumSeverityCount += 1;
      } else {
        acc.lowSeverityCount += 1;
      }
      return acc;
    },
    {
      transactionsChecked: state.transactions.length,
      completedTransactionsChecked: state.completedTransactions.length,
      walletsChecked: state.wallets.length,
      datasetsChecked: state.datasets.length,
      issueCount: 0,
      highSeverityCount: 0,
      mediumSeverityCount: 0,
      lowSeverityCount: 0,
    }
  );

  return {
    checkedAt: new Date().toISOString(),
    totals,
    issues: state.issues,
  };
}

async function collectConsistencyState(adminClient: any) {
  const [transactions, wallets, datasets] = await Promise.all([
    loadTransactions(adminClient),
    loadWallets(adminClient),
    loadDatasets(adminClient),
  ]);

  return buildConsistencyState({
    transactions,
    wallets,
    datasets,
  });
}

export async function runPaymentLedgerConsistencyCheck(
  adminClientOverride?: AdminClient
): Promise<PaymentLedgerConsistencyReport> {
  const admin = adminClientOverride ?? createAdminClient("payments_ledger");
  const adminClient = admin as any;
  const state = await collectConsistencyState(adminClient);
  return toConsistencyReport(state);
}

export async function runPaymentLedgerConsistencyRepair(
  options?: RepairOptions,
  adminClientOverride?: AdminClient
): Promise<PaymentLedgerRepairSummary> {
  const admin = adminClientOverride ?? createAdminClient("payments_ledger");
  const adminClient = admin as any;
  const dryRun = options?.dryRun !== false;
  const shouldRepairMissingWallets = options?.repairMissingWallets !== false;
  const shouldRepairWalletBalances = options?.repairWalletBalances === true;
  const shouldRepairDatasetPaidAmount = options?.repairDatasetPaidAmount !== false;
  const shouldRepairDatasetPaymentStatus =
    options?.repairDatasetPaymentStatus !== false;

  const beforeState = await collectConsistencyState(adminClient);
  const actions = {
    walletsCreated: 0,
    walletBalancesUpdated: 0,
    datasetPaidAmountsUpdated: 0,
    datasetStatusesUpdated: 0,
  };

  const beforeWalletMap = new Map(
    beforeState.wallets.map((wallet) => [wallet.user_id, wallet])
  );

  if (shouldRepairMissingWallets) {
    for (const [userId, expectedBalance] of beforeState.expectedWalletByUser.entries()) {
      if (beforeWalletMap.has(userId)) {
        continue;
      }

      actions.walletsCreated += 1;
      if (dryRun) {
        continue;
      }

      const currency =
        beforeState.preferredWalletCurrencyByUser.get(userId) ?? "usd";
      const { error } = await adminClient.from("wallets").upsert(
        {
          user_id: userId,
          available_balance: expectedBalance,
          pending_balance: 0,
          currency,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        throw new Error(
          `Failed to create missing wallet for user ${userId}: ${error.message}`
        );
      }
    }
  }

  if (shouldRepairWalletBalances) {
    for (const [userId, expectedBalance] of beforeState.expectedWalletByUser.entries()) {
      const wallet = beforeWalletMap.get(userId);
      if (!wallet) {
        continue;
      }

      const actualBalance = normalizeCents(wallet.available_balance);
      if (actualBalance === expectedBalance) {
        continue;
      }

      actions.walletBalancesUpdated += 1;
      if (dryRun) {
        continue;
      }

      const { error } = await adminClient
        .from("wallets")
        .update({
          available_balance: expectedBalance,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", wallet.id);

      if (error) {
        throw new Error(
          `Failed to repair wallet balance for user ${userId}: ${error.message}`
        );
      }
    }
  }

  if (shouldRepairDatasetPaidAmount || shouldRepairDatasetPaymentStatus) {
    for (const dataset of beforeState.datasets) {
      if (!beforeState.datasetsWithLedgerActivity.has(dataset.id)) {
        continue;
      }

      const expectedPaidCents = beforeState.expectedFundingByDataset.get(dataset.id) ?? 0;
      const expectedPaid = centsToDollars(expectedPaidCents);
      const actualPaid = Number(dataset.paid_amount ?? 0);
      const expectedStatus = beforeState.expectedPaymentStatusByDataset.get(dataset.id) ?? "unpaid";
      const actualStatus = dataset.payment_status ?? "unpaid";

      const updatePayload: Record<string, unknown> = {};

      if (shouldRepairDatasetPaidAmount && actualPaid !== expectedPaid) {
        updatePayload.paid_amount = expectedPaid;
        actions.datasetPaidAmountsUpdated += 1;
      }

      if (shouldRepairDatasetPaymentStatus && actualStatus !== expectedStatus) {
        updatePayload.payment_status = expectedStatus;
        actions.datasetStatusesUpdated += 1;
      }

      if (Object.keys(updatePayload).length === 0 || dryRun) {
        continue;
      }

      const { error } = await adminClient
        .from("dataset_requests")
        .update(updatePayload)
        .eq("id", dataset.id);

      if (error) {
        throw new Error(
          `Failed to repair dataset payment fields for ${dataset.id}: ${error.message}`
        );
      }
    }
  }

  const afterState = dryRun ? beforeState : await collectConsistencyState(adminClient);

  return {
    appliedAt: new Date().toISOString(),
    dryRun,
    actions,
    before: toConsistencyReport(beforeState),
    after: toConsistencyReport(afterState),
  };
}
