import "server-only";

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/security/structured-logger";
import type { Database } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;
type DatasetRow = Database["public"]["Tables"]["dataset_requests"]["Row"];
type WalletRow = Database["public"]["Tables"]["wallets"]["Row"];

type WalletRowWithCustomer = WalletRow & {
  stripe_customer_id?: string | null;
};

export type DatasetBudgetSummary = {
  totalBudgetCents: number;
  rewardCents: number;
  fundedCents: number;
  paidOutCents: number;
  remainingForFundingCents: number;
  remainingForPayoutCents: number;
  approvalStatus: DatasetRow["approval_status"] | null;
  paymentStatus: DatasetRow["payment_status"] | null;
};

export async function getDatasetBudgetSummary(
  datasetId: string,
  adminClientOverride?: AdminClient
): Promise<{ data?: DatasetBudgetSummary; error?: string }> {
  const adminClient = adminClientOverride ?? createAdminClient("payments_ledger");
  const adminDb = adminClient as any;

  const { data: dataset, error: datasetError } = await adminDb
    .from("dataset_requests")
    .select(
      "id, total_budget, reward_amount, samples_needed, paid_amount, approval_status, payment_status, status"
    )
    .eq("id", datasetId)
    .maybeSingle();

  if (datasetError || !dataset) {
    logError("Failed to load dataset budget", datasetError);
    return { error: "Dataset not found or budget unavailable" };
  }

  const derivedBudgetCents = Math.round(
    Number(dataset.samples_needed ?? 0) * Number(dataset.reward_amount ?? 0) * 100
  );
  const totalBudgetCents =
    Math.round(Number(dataset.total_budget ?? 0) * 100) || derivedBudgetCents;
  const rewardCents = Math.round(Number(dataset.reward_amount ?? 0) * 100);

  const [
    { data: fundingRows, error: fundingError },
    { data: payoutRows, error: payoutError },
  ] = await Promise.all([
    adminDb
      .from("transactions")
      .select("amount, net_amount")
      .eq("dataset_request_id", datasetId)
      .eq("type", "dataset_funding")
      .eq("status", "completed"),
    adminDb
      .from("transactions")
      .select("amount, net_amount")
      .eq("dataset_request_id", datasetId)
      .eq("type", "submission_payout")
      .eq("status", "completed"),
  ]);

  if (fundingError) {
    logError(
      "Failed to load dataset funding rows, defaulting to stored budget",
      fundingError
    );
  }

  if (payoutError) {
    logError("Failed to load dataset payout rows, defaulting to 0", payoutError);
  }

  const sumCents = (
    rows: Array<{ amount?: number | null; net_amount?: number | null }> | null
  ) =>
    (rows ?? []).reduce((sum, row) => {
      const netAmount = Number(row.net_amount ?? row.amount ?? 0);
      return sum + (Number.isFinite(netAmount) ? Math.round(netAmount) : 0);
    }, 0);

  const fundedFromTransactionsCents = sumCents(
    fundingRows as Array<{ amount?: number | null; net_amount?: number | null }> | null
  );
  const storedFundedCents = Math.round(Number(dataset.paid_amount ?? 0) * 100);
  const fundedCents = Math.max(
    0,
    Math.max(fundedFromTransactionsCents, storedFundedCents)
  );
  const paidOutCents = Math.max(
    0,
    sumCents(
      payoutRows as Array<{ amount?: number | null; net_amount?: number | null }> | null
    )
  );

  return {
    data: {
      totalBudgetCents,
      rewardCents,
      fundedCents,
      paidOutCents,
      remainingForFundingCents: Math.max(0, totalBudgetCents - fundedCents),
      remainingForPayoutCents: Math.max(0, fundedCents - paidOutCents),
      approvalStatus: (dataset.approval_status ?? null) as DatasetRow["approval_status"] | null,
      paymentStatus: (dataset.payment_status ?? null) as DatasetRow["payment_status"] | null,
    },
  };
}

export const ensureWalletRecord = async (
  adminClient: AdminClient,
  userId: string,
  currency = "usd"
): Promise<WalletRowWithCustomer> => {
  const adminDb = adminClient as any;

  const { data: walletRow, error: walletError } = await adminDb
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (walletError && walletError.code !== "PGRST116") {
    logError("Failed to load wallet record", walletError);
    throw new Error("Failed to load wallet record");
  }

  if (walletRow) {
    return walletRow as WalletRowWithCustomer;
  }

  const { data: inserted, error: upsertError } = await adminDb
    .from("wallets")
    .upsert(
      {
        user_id: userId,
        currency: currency.toLowerCase(),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (upsertError || !inserted) {
    logError("Failed to ensure wallet record", upsertError);
    throw new Error("Failed to ensure wallet record");
  }

  return inserted as WalletRowWithCustomer;
};

export const ensureStripeCustomerForUser = async (
  stripe: Stripe,
  adminClient: AdminClient,
  userId: string,
  email?: string | null,
  name?: string | null
): Promise<{ customerId: string; wallet: WalletRowWithCustomer }> => {
  const adminDb = adminClient as any;
  let wallet = await ensureWalletRecord(adminClient, userId);

  if (wallet.stripe_customer_id) {
    return { customerId: wallet.stripe_customer_id, wallet };
  }

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    name: name ?? undefined,
    metadata: {
      platform_user_id: userId,
    },
  });

  const { data: updatedWallet, error: updateError } = await adminDb
    .from("wallets")
    .update({
      stripe_customer_id: customer.id,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select("*")
    .single();

  if (updateError || !updatedWallet) {
    logError("Failed to persist Stripe customer id", updateError);
    throw new Error("Failed to persist Stripe customer id");
  }

  wallet = updatedWallet as WalletRowWithCustomer;

  return { customerId: customer.id, wallet };
};

const pickBalanceEntry = (
  entries: Stripe.Balance.Available[] | undefined,
  preferredCurrency: string
): Stripe.Balance.Available | undefined => {
  if (!entries?.length) return undefined;
  const normalized = preferredCurrency.toLowerCase();
  return (
    entries.find((entry) => entry.currency.toLowerCase() === normalized) ??
    entries[0]
  );
};

const resolveCashBalance = (
  cash: Stripe.CashBalance | null | undefined,
  preferredCurrency: string
) => {
  const availableMap = cash?.available ?? {};
  const normalized = preferredCurrency.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(availableMap, normalized)) {
    const amount = availableMap[normalized];
    if (typeof amount === "number") {
      return { amount, currency: normalized };
    }
  }

  const [firstCurrency] = Object.keys(availableMap);
  if (firstCurrency) {
    const amount = availableMap[firstCurrency];
    if (typeof amount === "number") {
      return { amount, currency: firstCurrency };
    }
  }

  return { amount: 0, currency: normalized };
};

export const syncWalletFromConnectAccount = async (
  stripe: Stripe,
  adminClient: AdminClient,
  wallet: WalletRowWithCustomer,
  stripeAccountId: string,
  preferredCurrency?: string | null
): Promise<WalletRowWithCustomer> => {
  const currencyPreference = (
    preferredCurrency ??
    wallet.currency ??
    "usd"
  ).toLowerCase();

  try {
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeAccountId,
    });

    const availableEntry = pickBalanceEntry(
      balance.available,
      currencyPreference
    );
    const pendingEntry = pickBalanceEntry(balance.pending, currencyPreference);
    const currencyCode = (
      availableEntry?.currency ??
      pendingEntry?.currency ??
      currencyPreference
    ).toLowerCase();
    const availableCents = availableEntry?.amount ?? 0;
    const pendingCents = pendingEntry?.amount ?? 0;
    const syncedAt = new Date().toISOString();
    const adminDb = adminClient as any;

    const { data: updatedWallet, error: updateError } = await adminDb
      .from("wallets")
      .update({
        available_balance: availableCents,
        pending_balance: pendingCents,
        currency: currencyCode,
        last_synced_at: syncedAt,
      })
      .eq("id", wallet.id)
      .select("*")
      .single();

    if (!updateError && updatedWallet) {
      return updatedWallet as WalletRowWithCustomer;
    }

    if (updateError) {
      logError("Failed to update wallet from Stripe balance", updateError);
    }

    return {
      ...wallet,
      available_balance: availableCents,
      pending_balance: pendingCents,
      currency: currencyCode,
      last_synced_at: syncedAt,
    };
  } catch (error) {
    logError("Failed to retrieve Stripe balance", error);
    return wallet;
  }
};

export const syncWalletFromCustomer = async (
  stripe: Stripe,
  adminClient: AdminClient,
  wallet: WalletRowWithCustomer,
  customerId: string
): Promise<WalletRowWithCustomer> => {
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["cash_balance"],
    });

    if (!customer || (customer as Stripe.DeletedCustomer).deleted) {
      return wallet;
    }

    const liveCustomer = customer as Stripe.Customer;
    const cashBalance = liveCustomer.cash_balance as
      | Stripe.CashBalance
      | null
      | undefined;
    const hasCashEntries = Object.values(cashBalance?.available ?? {}).some(
      (value) => typeof value === "number" && value !== 0
    );

    if (!hasCashEntries) {
      return wallet;
    }

    const preferredCurrency = wallet.currency ?? "usd";
    const { amount: availableCents, currency: currencyCode } =
      resolveCashBalance(cashBalance, preferredCurrency);
    const syncedAt = new Date().toISOString();
    const adminDb = adminClient as any;

    const { data: updatedWallet, error: updateError } = await adminDb
      .from("wallets")
      .update({
        available_balance: availableCents,
        pending_balance: 0,
        currency: currencyCode,
        last_synced_at: syncedAt,
      })
      .eq("id", wallet.id)
      .select("*")
      .single();

    if (!updateError && updatedWallet) {
      return updatedWallet as WalletRowWithCustomer;
    }

    if (updateError) {
      logError("Failed to update wallet from Stripe customer", updateError);
    }

    return {
      ...wallet,
      available_balance: availableCents,
      pending_balance: 0,
      currency: currencyCode,
      last_synced_at: syncedAt,
    };
  } catch (error) {
    logError("Failed to retrieve Stripe customer balance", error);
    return wallet;
  }
};
