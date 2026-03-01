"use server";

import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import type { Database, Json } from "@/types/database";
import { deriveDatasetStatus } from "@/lib/utils/dataset-status";
import { recordFunnelEvent } from "@/lib/analytics/funnel-events-server";

const PLATFORM_FEE_PERCENTAGE = Number(
  process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE ?? "10"
);

const centsFromAmount = (amount: number) =>
  Math.round(Number(amount ?? 0) * 100);
const amountFromCents = (cents: number) => Number(cents ?? 0) / 100;

type StripeAccountInsert =
  Database["public"]["Tables"]["stripe_accounts"]["Insert"];
type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type WalletRow = Database["public"]["Tables"]["wallets"]["Row"];
type AdminClient = ReturnType<typeof createAdminClient>;
type DatasetRow = Database["public"]["Tables"]["dataset_requests"]["Row"];

type ServerCountryConfig = {
  requiresSSN?: boolean;
  requiresRouting?: boolean;
};

const SERVER_COUNTRY_CONFIG: Record<string, ServerCountryConfig> = {
  US: { requiresSSN: true, requiresRouting: true },
  CA: { requiresRouting: true },
  GB: { requiresRouting: true },
  AU: { requiresRouting: true },
  NZ: { requiresRouting: true },
  JP: { requiresRouting: true },
  HK: { requiresRouting: true },
  SG: { requiresRouting: true },
};

const onboardingSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email().optional(),
    country: z
      .string()
      .length(2, "Country should be the 2-letter ISO code")
      .transform((val) => val.toUpperCase()),
    currency: z
      .string()
      .length(3, "Currency should be the 3-letter ISO code")
      .transform((val) => val.toLowerCase()),
    dobDay: z.coerce.number().int().min(1).max(31),
    dobMonth: z.coerce.number().int().min(1).max(12),
    dobYear: z.coerce
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() - 13),
    line1: z.string().min(2, "Address line is required"),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State / region is required").optional(),
    postalCode: z.string().min(2, "Postal code is required"),
    ssnLast4: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || /^\d{4}$/.test(val), "Must be 4 digits"),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(
        (val) => !val || val.replace(/\D/g, "").length >= 6,
        "Phone looks too short"
      ),
    bankRoutingNumber: z.string().trim().optional(),
    bankAccountNumber: z.string().min(4, "Account number required"),
    bankSwiftCode: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || val.length >= 6, "SWIFT/BIC looks too short"),
    tosAccepted: z
      .boolean()
      .refine(
        (val) => val,
        "You must accept the Stripe Connected Account Terms"
      ),
    ipAddress: z
      .string()
      .optional()
      .transform((val) => val ?? "127.0.0.1"),
  })
  .superRefine((data, ctx) => {
    const config = SERVER_COUNTRY_CONFIG[data.country];
    if (config?.requiresSSN && !data.ssnLast4?.trim()) {
      ctx.addIssue({
        path: ["ssnLast4"],
        code: z.ZodIssueCode.custom,
        message: "SSN last 4 digits are required for this country",
      });
    }
    if (config?.requiresRouting && !data.bankRoutingNumber?.trim()) {
      ctx.addIssue({
        path: ["bankRoutingNumber"],
        code: z.ZodIssueCode.custom,
        message: "Bank routing number is required for this country",
      });
    }
  });

type StripeOnboardingPayload = z.infer<typeof onboardingSchema>;

type TransactionDirection = "credit" | "debit";
type TransactionType =
  | "wallet_deposit"
  | "wallet_withdrawal"
  | "dataset_funding"
  | "submission_payout"
  | "platform_fee"
  | "stripe_adjustment"
  | "refund";

interface RecordTransactionInput {
  userId: string;
  direction: TransactionDirection;
  type: TransactionType;
  amountInCents: number;
  currency?: string;
  status?: "pending" | "completed" | "failed" | "cancelled";
  referenceId?: string | null;
  datasetRequestId?: string | null;
  submissionId?: string | null;
  metadata?: Record<string, unknown>;
  feeAmountInCents?: number;
}

const CONNECT_ACCOUNT_URL = "https://caudals.com" as const;

const CONNECT_ACCOUNT_PROFILE: Stripe.AccountCreateParams.BusinessProfile = {
  product_description:
    "Receives payouts for Caudals contributor work (non-commercial)",
  mcc: "5734",
  url: CONNECT_ACCOUNT_URL,
};

function assertStripeConfigured() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured. Missing STRIPE_SECRET_KEY.");
  }
}

function describeTransaction(tx: TransactionRow): string {
  switch (tx.type) {
    case "wallet_deposit":
      return "Wallet funding";
    case "wallet_withdrawal":
      return "Wallet withdrawal";
    case "dataset_funding":
      return tx.dataset_request_id
        ? `Dataset funding ${tx.dataset_request_id}`
        : "Dataset funding";
    case "submission_payout":
      return tx.submission_id
        ? `Payout for submission ${tx.submission_id}`
        : "Submission payout";
    case "refund":
      return "Refund";
    case "stripe_adjustment":
      return "Stripe adjustment";
    case "platform_fee":
      return "Platform fee";
    default:
      return "Transaction";
  }
}

const normalizeOptionalString = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toStripeError = (error: unknown): Stripe.errors.StripeError | null => {
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    "message" in error
  ) {
    return error as Stripe.errors.StripeError;
  }
  return null;
};

const isAccessRevokedError = (error: unknown, accountId?: string): boolean => {
  const stripeError = toStripeError(error);
  if (!stripeError) return false;

  const message = stripeError.message?.toLowerCase() ?? "";

  if (error instanceof Stripe.errors.StripePermissionError) {
    return true;
  }

  if (stripeError.code === "permission_denied") {
    return true;
  }

  if (stripeError.code === "resource_missing") {
    return true;
  }

  if (message.includes("does not have access to account")) {
    if (accountId) {
      return message.includes(accountId.toLowerCase());
    }
    return true;
  }

  if (message.includes("application access may have been revoked")) {
    return true;
  }

  return false;
};

const isMissingCustomCapabilityError = (error: unknown): boolean => {
  const stripeError = toStripeError(error);
  if (!stripeError) return false;

  const message = stripeError.message?.toLowerCase() ?? "";

  if (error instanceof Stripe.errors.StripePermissionError) {
    return true;
  }

  if (stripeError.code === "permission_denied") {
    return true;
  }

  return (
    message.includes("custom accounts are not enabled") ||
    message.includes("does not have the required permissions") ||
    message.includes("cannot create accounts of this type")
  );
};

const customCapabilityHelpMessage =
  "Stripe rejected the onboarding request because your platform isn’t enabled for Custom Connect. In the Stripe dashboard, go to Connect → Settings and request access to Custom accounts (card_payments and transfers capabilities). Once Stripe approves, retry the onboarding.";

type WalletRowWithCustomer = WalletRow & {
  stripe_customer_id?: string | null;
};

async function recordFundingFunnelEvent(input: {
  userId: string;
  datasetId: string;
  amountCents: number;
  currency?: string | null;
  source: "stripe" | "wallet";
  referenceId?: string | null;
}) {
  try {
    await recordFunnelEvent({
      eventName: "funnel_fund",
      userId: input.userId,
      userRole: "requester",
      source: "server",
      payload: {
        dataset_id: input.datasetId,
        amount_cents: input.amountCents,
        currency: input.currency?.toUpperCase() ?? null,
        funding_source: input.source,
        reference_id: input.referenceId ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to record funnel funding event", {
      userId: input.userId,
      datasetId: input.datasetId,
      source: input.source,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

type DatasetBudgetSummary = {
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
  const admin = adminClientOverride ?? createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const { data: dataset, error: datasetError } = await adminClient
    .from("dataset_requests")
    .select(
      "id, total_budget, reward_amount, samples_needed, approval_status, payment_status, status"
    )
    .eq("id", datasetId)
    .maybeSingle();

  if (datasetError || !dataset) {
    console.error("Failed to load dataset budget", datasetError);
    return { error: "Dataset not found or budget unavailable" };
  }

  const derivedBudgetCents = Math.round(
    Number(dataset.samples_needed ?? 0) * Number(dataset.reward_amount ?? 0) * 100
  );
  const totalBudgetCents = Math.round(Number(dataset.total_budget ?? 0) * 100) || derivedBudgetCents;
  const rewardCents = Math.round(Number(dataset.reward_amount ?? 0) * 100);

  const { data: fundingRow, error: fundingError } = await adminClient
    .from("transactions")
    .select("funded_cents:sum(net_amount)")
    .eq("dataset_request_id", datasetId)
    .eq("type", "dataset_funding")
    .eq("status", "completed")
    .maybeSingle();

  if (fundingError && fundingError.code !== "PGRST116") {
    console.warn("Failed to aggregate dataset funding, defaulting to 0", fundingError);
  }

  const { data: payoutRow, error: payoutError } = await adminClient
    .from("transactions")
    .select("payout_cents:sum(net_amount)")
    .eq("dataset_request_id", datasetId)
    .eq("type", "submission_payout")
    .eq("status", "completed")
    .maybeSingle();

  if (payoutError && payoutError.code !== "PGRST116") {
    console.warn("Failed to aggregate dataset payouts, defaulting to 0", payoutError);
  }

  const fundedCents = Math.round(
    Number((fundingRow as { funded_cents: number | null } | null)?.funded_cents ?? 0)
  );
  const paidOutCents = Math.round(
    Number((payoutRow as { payout_cents: number | null } | null)?.payout_cents ?? 0)
  );
  const remainingForFundingCents = Math.max(0, totalBudgetCents - fundedCents);
  const remainingForPayoutCents = Math.max(0, fundedCents - paidOutCents);

  return {
    data: {
      totalBudgetCents,
      rewardCents,
      fundedCents,
      paidOutCents,
      remainingForFundingCents,
      remainingForPayoutCents,
      approvalStatus: (dataset.approval_status ?? null) as DatasetRow["approval_status"] | null,
      paymentStatus: (dataset.payment_status ?? null) as DatasetRow["payment_status"] | null,
    },
  };
}

function paymentStatusFromFunding(
  totalBudgetCents: number,
  fundedCents: number
): DatasetRow["payment_status"] {
  if (totalBudgetCents <= 0) return "partial";
  if (fundedCents >= totalBudgetCents) return "paid";
  if (fundedCents > 0) return "partial";
  return "unpaid";
}

export const ensureWalletRecord = async (
  adminClient: AdminClient,
  userId: string,
  currency = "usd"
): Promise<WalletRowWithCustomer> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: walletRow, error: walletError } = await (adminClient as any)
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (walletError && walletError.code !== "PGRST116") {
    console.error("Failed to load wallet record", walletError);
    throw new Error("Failed to load wallet record");
  }

  if (walletRow) {
    return walletRow as WalletRowWithCustomer;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: upsertError } = await (adminClient as any)
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
    console.error("Failed to ensure wallet record", upsertError);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedWallet, error: updateError } = await (adminClient as any)
    .from("wallets")
    .update({
      stripe_customer_id: customer.id,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select("*")
    .single();

  if (updateError || !updatedWallet) {
    console.error("Failed to persist Stripe customer id", updateError);
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

const serializeWalletRecord = (wallet: WalletRow) => ({
  id: wallet.id,
  user_id: wallet.user_id,
  balance: amountFromCents(wallet.available_balance),
  available_balance: amountFromCents(wallet.available_balance),
  pending_balance: amountFromCents(wallet.pending_balance),
  currency: (wallet.currency ?? "usd").toUpperCase(),
  updated_at: wallet.updated_at,
  last_synced_at: wallet.last_synced_at,
});

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      return updatedWallet as WalletRow;
    }

    if (updateError) {
      console.error("Failed to update wallet from Stripe balance", updateError);
    }

    return {
      ...wallet,
      available_balance: availableCents,
      pending_balance: pendingCents,
      currency: currencyCode,
      last_synced_at: syncedAt,
    };
  } catch (error) {
    console.error("Failed to retrieve Stripe balance", error);
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

    // Avoid wiping the local wallet when no cash balance exists in Stripe
    if (!hasCashEntries) {
      return wallet;
    }

    const preferredCurrency = wallet.currency ?? "usd";
    const { amount: availableCents, currency: currencyCode } =
      resolveCashBalance(cashBalance, preferredCurrency);
    const pendingCents = 0;
    const syncedAt = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      return updatedWallet as WalletRow;
    }

    if (updateError) {
      console.error(
        "Failed to update wallet from Stripe customer",
        updateError
      );
    }

    return {
      ...wallet,
      available_balance: availableCents,
      pending_balance: pendingCents,
      currency: currencyCode,
      last_synced_at: syncedAt,
    };
  } catch (error) {
    console.error("Failed to retrieve Stripe customer balance", error);
    return wallet;
  }
};

async function recordTransaction({
  userId,
  direction,
  type,
  amountInCents,
  currency = "usd",
  status = "completed",
  referenceId = null,
  datasetRequestId = null,
  submissionId = null,
  metadata = {},
  feeAmountInCents = 0,
}: RecordTransactionInput) {
  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const payload: TransactionInsert = {
    user_id: userId,
    direction,
    type,
    amount: amountInCents,
    fee_amount: feeAmountInCents,
    currency: currency.toLowerCase(),
    status,
    reference_id: referenceId,
    dataset_request_id: datasetRequestId,
    submission_id: submissionId,
    source_type: "stripe",
    metadata: (metadata as Json) ?? null,
  };

  const { data, error } = await adminClient
    .from("transactions")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Failed to record transaction", error);
    throw new Error("Failed to record transaction");
  }

  return data;
}

async function upsertStripeAccountRecord(
  userId: string,
  account: Stripe.Account
) {
  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const bankLast4 =
    account.external_accounts?.data?.[0]?.object === "bank_account"
      ? account.external_accounts.data[0].last4
      : null;
  const bankStatus =
    account.external_accounts?.data?.[0]?.object === "bank_account"
      ? account.external_accounts.data[0].status
      : null;

  const payload: StripeAccountInsert = {
    user_id: userId,
    stripe_account_id: account.id,
    account_type: (account.type ?? "custom") as
      | "custom"
      | "express"
      | "standard",
    country: account.country ?? "US",
    default_currency: account.default_currency ?? "usd",
    status: account.details_submitted
      ? account.charges_enabled && account.payouts_enabled
        ? "active"
        : "restricted"
      : "pending",
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    details_submitted: account.details_submitted ?? false,
    requirements_currently_due: (account.requirements?.currently_due ??
      []) as Json,
    requirements_past_due: (account.requirements?.past_due ?? []) as Json,
    requirements_disabled_reason: account.requirements?.disabled_reason ?? null,
    bank_status: bankStatus,
    bank_last4: bankLast4,
    last_synced_at: new Date().toISOString(),
  };

  const { error: upsertError } = await adminClient
    .from("stripe_accounts")
    // Conflict on user_id so we replace any previous account mapping for this user
    .upsert(payload, { onConflict: "user_id" });

  if (upsertError) {
    console.error("Failed to upsert stripe account record", upsertError);
    throw new Error("Failed to persist Stripe account record");
  }

  return payload;
}

function calculatePlatformFee(amount: number) {
  const normalizedFee = Number.isFinite(PLATFORM_FEE_PERCENTAGE)
    ? PLATFORM_FEE_PERCENTAGE
    : 10;
  return Math.round((amount * normalizedFee) / 100);
}

export async function getUserWallet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const stripe = getStripeServer();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, mail")
    .eq("id", user.id)
    .single();

  let walletRecord: WalletRow;

  try {
    walletRecord = await ensureWalletRecord(adminClient, user.id);
  } catch (errorEnsure) {
    console.error("Failed to prepare wallet record", errorEnsure);
    return { error: "Failed to load wallet" };
  }

  const { data: accountRecord } = await adminClient
    .from("stripe_accounts")
    .select("stripe_account_id, default_currency")
    .eq("user_id", user.id)
    .maybeSingle();

  const isContributor = Boolean(accountRecord?.stripe_account_id);

  if (isContributor && accountRecord?.stripe_account_id) {
    walletRecord = await syncWalletFromConnectAccount(
      stripe,
      adminClient,
      walletRecord,
      accountRecord.stripe_account_id,
      accountRecord.default_currency
    );

    return { data: serializeWalletRecord(walletRecord) };
  }

  return {
    data: serializeWalletRecord(walletRecord),
  };
}

export async function getUserTransactions(limit = 50) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const { data: transactions, error } = await adminClient
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching transactions", error);
    return { error: "Failed to fetch transactions" };
  }

  const typedTransactions = (transactions ?? []) as TransactionRow[];

  return {
    data: typedTransactions.map((tx) => ({
      ...tx,
      amount: amountFromCents(tx.amount),
      fee_amount: amountFromCents(tx.fee_amount ?? 0),
      net_amount: amountFromCents(tx.net_amount),
      description: describeTransaction(tx),
    })),
  };
}

export async function createPaymentIntent(
  datasetId: string,
  amount: number,
  currency = "USD"
) {
  assertStripeConfigured();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const normalizedCurrency = currency.toLowerCase();
  const amountInCents = centsFromAmount(amount);

  if (amountInCents <= 0) {
    return { error: "Amount must be greater than zero" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const stripe = getStripeServer();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, mail")
    .eq("id", user.id)
    .single();

  let customerId: string | null = null;

  try {
    const ensuredCustomer = await ensureStripeCustomerForUser(
      stripe,
      adminClient,
      user.id,
      profile?.mail ?? user.email,
      profile?.full_name
    );
    customerId = ensuredCustomer.customerId;
  } catch (customerError) {
    console.error(
      "Failed to ensure Stripe customer before payment intent",
      customerError
    );
  }

  try {
    if (datasetId === "wallet-funding") {
      const metadata: Record<string, string> = {
        user_id: user.id,
        type: "wallet_deposit",
      };

      if (customerId) {
        metadata.stripe_customer_id = customerId;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: normalizedCurrency,
        customer: customerId ?? undefined,
        automatic_payment_methods: { enabled: true },
        metadata,
        receipt_email: profile?.mail ?? user.email ?? undefined,
        description: `Wallet funding for ${user.email ?? user.id}`,
      });

      return {
        data: {
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id,
        },
      };
    }

  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id, title, created_by, approval_status, payment_status, status")
    .eq("id", datasetId)
    .single();

    if (datasetError || !dataset || dataset.created_by !== user.id) {
      return { error: "Dataset not found or access denied" };
    }

    const budgetSummary = await getDatasetBudgetSummary(datasetId, adminClient);
    if (budgetSummary.error || !budgetSummary.data) {
      return { error: budgetSummary.error ?? "Failed to load dataset budget" };
    }

    const {
      totalBudgetCents,
      remainingForFundingCents,
      fundedCents,
    } = budgetSummary.data;

    if (totalBudgetCents <= 0) {
      return { error: "Dataset has no total budget set. Add a budget before funding." };
    }

    if (remainingForFundingCents <= 0) {
      return { error: "Dataset is already fully funded." };
    }

    if (amountInCents > remainingForFundingCents) {
      const maxFundable = amountFromCents(remainingForFundingCents);
      return {
        error: `You can fund up to ${maxFundable.toFixed(2)} to reach the dataset budget.`,
      };
    }

    const metadata: Record<string, string> = {
      user_id: user.id,
      dataset_id: datasetId,
      type: "dataset_funding",
      current_funded: fundedCents.toString(),
    };

    if (customerId) {
      metadata.stripe_customer_id = customerId;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: normalizedCurrency,
      customer: customerId ?? undefined,
      automatic_payment_methods: { enabled: true },
      metadata,
      description: `Funding dataset ${dataset.title}`,
      transfer_group: `dataset_${datasetId}`,
      receipt_email: profile?.mail ?? user.email ?? undefined,
    });

    await supabase
      .from("dataset_requests")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq("id", datasetId);

    return {
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      },
    };
  } catch (error) {
    console.error("Failed to create PaymentIntent", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create payment intent";
    return { error: message };
  }
}

export async function confirmPayment(paymentIntentId: string) {
  assertStripeConfigured();

  const supabase = await createClient();
  const stripe = getStripeServer();
  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const { data: existingTx } = await adminClient
      .from("transactions")
      .select("id")
      .eq("reference_id", paymentIntent.id)
      .maybeSingle();

    if (existingTx) {
      return { data: { success: true } };
    }

    if (paymentIntent.status !== "succeeded") {
      return { error: "Payment not successful" };
    }

    const metadata = paymentIntent.metadata ?? {};
    const userId = metadata.user_id;

    if (!userId) {
      return { error: "Payment metadata missing user" };
    }

    if (metadata.type === "wallet_deposit") {
      await recordTransaction({
        userId,
        direction: "credit",
        type: "wallet_deposit",
        amountInCents: paymentIntent.amount_received ?? paymentIntent.amount,
        currency: paymentIntent.currency,
        referenceId: paymentIntent.id,
        metadata: metadata as Record<string, unknown>,
      });

      if (typeof paymentIntent.customer === "string") {
        try {
          const { customerId, wallet } = await ensureStripeCustomerForUser(
            stripe,
            adminClient,
            userId,
            paymentIntent.receipt_email ?? undefined,
            undefined
          );

          await syncWalletFromCustomer(stripe, adminClient, wallet, customerId);
        } catch (syncError) {
          console.error(
            "Failed to sync wallet after payment confirmation",
            syncError
          );
        }
      }

      return { data: { success: true } };
    }

    if (metadata.type === "dataset_funding" && metadata.dataset_id) {
      const datasetId = metadata.dataset_id;
      const budgetSummary = await getDatasetBudgetSummary(datasetId, adminClient);

      if (budgetSummary.error || !budgetSummary.data) {
        return { error: budgetSummary.error ?? "Failed to load dataset budget" };
      }

      const {
        totalBudgetCents,
        fundedCents,
        remainingForFundingCents,
        approvalStatus,
      } = budgetSummary.data;

      if (totalBudgetCents <= 0) {
        return { error: "Dataset has no total budget set. Add a budget before funding." };
      }

      if (remainingForFundingCents <= 0) {
        return { data: { success: true } }; // Already fully funded; ignore extra payment.
      }

      const amountToApply = Math.min(
        paymentIntent.amount_received ?? paymentIntent.amount,
        remainingForFundingCents
      );

      await recordTransaction({
        userId,
        direction: "debit",
        type: "dataset_funding",
        amountInCents: amountToApply,
        currency: paymentIntent.currency,
        referenceId: paymentIntent.id,
        datasetRequestId: datasetId,
        metadata: metadata as Record<string, unknown>,
      });

      const newFundedCents = fundedCents + amountToApply;
      const newPaidAmount =
        totalBudgetCents > 0
          ? amountFromCents(Math.min(totalBudgetCents, newFundedCents))
          : amountFromCents(newFundedCents);
      const nextStatus =
        totalBudgetCents > 0
          ? newFundedCents >= totalBudgetCents
            ? "paid"
            : "partial"
          : "partial";

      await supabase
        .from("dataset_requests")
        .update({
          payment_status: nextStatus,
          paid_amount: newPaidAmount,
          stripe_payment_intent_id: paymentIntent.id,
          status: deriveDatasetStatus(approvalStatus, nextStatus),
        })
        .eq("id", datasetId);

      await recordFundingFunnelEvent({
        userId,
        datasetId,
        amountCents: amountToApply,
        currency: paymentIntent.currency,
        source: "stripe",
        referenceId: paymentIntent.id,
      });

      if (typeof paymentIntent.customer === "string") {
        try {
          const { customerId, wallet } = await ensureStripeCustomerForUser(
            stripe,
            adminClient,
            userId,
            paymentIntent.receipt_email ?? undefined,
            undefined
          );

          await syncWalletFromCustomer(stripe, adminClient, wallet, customerId);
        } catch (syncError) {
          console.error(
            "Failed to sync wallet after dataset payment",
            syncError
          );
        }
      }

      return { data: { success: true } };
    }

    return { data: { success: true } };
  } catch (error) {
    console.error("Error confirming payment", error);
    return { error: "Failed to confirm payment" };
  }
}

export async function payWithWallet(datasetId: string, amount: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const amountInCents = centsFromAmount(amount);

  if (amountInCents <= 0) {
    return { error: "Amount must be greater than zero" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const { data: wallet } = await adminClient
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!wallet || wallet.available_balance < amountInCents) {
    return { error: "Insufficient wallet balance" };
  }

  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id, title, paid_amount, approval_status, payment_status, status")
    .eq("id", datasetId)
    .single();

  if (datasetError || !dataset) {
    return { error: "Dataset not found" };
  }

  const budgetSummary = await getDatasetBudgetSummary(datasetId, adminClient);
  if (budgetSummary.error || !budgetSummary.data) {
    return { error: budgetSummary.error ?? "Failed to load dataset budget" };
  }

  const {
    totalBudgetCents,
    remainingForFundingCents,
    fundedCents,
    approvalStatus,
  } = budgetSummary.data;

  if (totalBudgetCents <= 0) {
    return { error: "Dataset has no total budget set. Add a budget before funding." };
  }

  if (remainingForFundingCents <= 0) {
    return { error: "Dataset is already fully funded." };
  }

  if (amountInCents > remainingForFundingCents) {
    return {
      error: `You can fund up to ${amountFromCents(remainingForFundingCents).toFixed(
        2
      )} to reach the dataset budget.`,
    };
  }

  const walletReferenceId = `wallet-${Date.now()}`;

  await recordTransaction({
    userId: user.id,
    direction: "debit",
    type: "dataset_funding",
    amountInCents,
    currency: wallet.currency,
    referenceId: walletReferenceId,
    datasetRequestId: datasetId,
    metadata: {
      source: "wallet",
    },
  });

  const newFundedCents = fundedCents + amountInCents;
  const previousPaid = Number(dataset.paid_amount ?? 0);
  const totalBudget = Number(totalBudgetCents) / 100;
  const newPaidAmount = Math.min(totalBudget, previousPaid + amount);
  const nextStatus =
    totalBudgetCents > 0
      ? newFundedCents >= totalBudgetCents
        ? "paid"
        : "partial"
      : "partial";

  await supabase
    .from("dataset_requests")
    .update({
      payment_status: nextStatus,
      paid_amount: newPaidAmount,
      status: deriveDatasetStatus(approvalStatus, nextStatus),
    })
    .eq("id", datasetId);

  await recordFundingFunnelEvent({
    userId: user.id,
    datasetId,
    amountCents: amountInCents,
    currency: wallet.currency,
    source: "wallet",
    referenceId: walletReferenceId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/requester/datasets");

  return {
    data: {
      success: true,
    },
  };
}

export async function submitStripeOnboarding(
  rawInput: StripeOnboardingPayload
) {
  assertStripeConfigured();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const result = onboardingSchema.safeParse(rawInput);

  if (!result.success) {
    return {
      error: result.error.issues.map((issue) => issue.message).join(", "),
    };
  }

  const payload = result.data;
  const normalizedCountry = payload.country.toUpperCase();
  const normalizedCurrency = payload.currency.toLowerCase();
  const stripe = getStripeServer();
  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const fallbackIp = forwardedFor?.split(",")?.[0]?.trim();
  const ipForTos =
    payload.ipAddress && payload.ipAddress !== "127.0.0.1"
      ? payload.ipAddress
      : (fallbackIp ?? "127.0.0.1");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, mail")
    .eq("id", user.id)
    .single();

  const { data: existingAccount } = await adminClient
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  try {
    let accountRecord = existingAccount ?? null;
    let managedAccount: Stripe.Account | null = null;

    if (accountRecord?.stripe_account_id) {
      try {
        managedAccount = await stripe.accounts.retrieve(
          accountRecord.stripe_account_id,
          { expand: ["external_accounts"] }
        );
      } catch (error) {
        if (isAccessRevokedError(error, accountRecord.stripe_account_id)) {
          console.warn(
            "Lost access to existing Stripe account; removing local mapping",
            accountRecord.stripe_account_id
          );
          await adminClient
            .from("stripe_accounts")
            .delete()
            .eq("stripe_account_id", accountRecord.stripe_account_id);
          accountRecord = null;
        } else if (isMissingCustomCapabilityError(error)) {
          return { error: customCapabilityHelpMessage };
        } else {
          throw error;
        }
      }
    }

    if (!managedAccount) {
      try {
        const createdAccount = await stripe.accounts.create({
          type: "custom",
          country: normalizedCountry,
          email: payload.email ?? profile?.mail ?? user.email ?? undefined,
          business_type: "individual",
          capabilities: {
            // Only request transfers for payout-only use case.
            transfers: { requested: true },
          },
          tos_acceptance: {
            date: Math.floor(Date.now() / 1000),
            ip: ipForTos,
          },
          business_profile: CONNECT_ACCOUNT_PROFILE,
        });

        await upsertStripeAccountRecord(user.id, createdAccount);
        managedAccount = await stripe.accounts.retrieve(createdAccount.id, {
          expand: ["external_accounts"],
        });
      } catch (error) {
        if (isMissingCustomCapabilityError(error)) {
          return { error: customCapabilityHelpMessage };
        }
        throw error;
      }
    }

    if (!managedAccount) {
      throw new Error("Failed to create Stripe Connect account");
    }

    const accountId = managedAccount.id;
    const accountHolderName = `${payload.firstName} ${payload.lastName}`.trim();

    const individualAddress: {
      line1: string;
      city: string;
      postal_code: string;
      country: string;
      state?: string;
    } = {
      line1: payload.line1,
      city: payload.city,
      postal_code: payload.postalCode,
      country: normalizedCountry,
    };

    const maybeState = normalizeOptionalString(payload.state);
    if (maybeState) {
      individualAddress.state = maybeState;
    }

    const individual: Stripe.AccountUpdateParams.Individual = {
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email ?? profile?.mail ?? user.email ?? undefined,
      dob: {
        day: payload.dobDay,
        month: payload.dobMonth,
        year: payload.dobYear,
      },
      address: individualAddress,
    };

    const maybePhone = normalizeOptionalString(payload.phone);
    if (maybePhone) {
      individual.phone = maybePhone;
    }

    const maybeSSN = normalizeOptionalString(payload.ssnLast4);
    if (maybeSSN) {
      individual.ssn_last_4 = maybeSSN;
    }

    const updatePayload: Stripe.AccountUpdateParams = {
      individual,
      business_profile: CONNECT_ACCOUNT_PROFILE,
      business_type: "individual",
      settings: {
        payouts: {
          schedule: {
            interval: "daily",
          },
        },
      },
    };

    if (
      !managedAccount.default_currency ||
      managedAccount.default_currency.toLowerCase() !== normalizedCurrency
    ) {
      updatePayload.default_currency = normalizedCurrency;
    }

    try {
      await stripe.accounts.update(accountId, updatePayload);
    } catch (error) {
      if (isMissingCustomCapabilityError(error)) {
        return { error: customCapabilityHelpMessage };
      }
      if (isAccessRevokedError(error, accountId)) {
        await adminClient
          .from("stripe_accounts")
          .delete()
          .eq("stripe_account_id", accountId);
        return {
          error:
            "Stripe rejected the update because this API key no longer has access to the connected account. Disconnect it from Settings → Payments and try onboarding again.",
        };
      }
      throw error;
    }

    const accountSnapshot = await stripe.accounts.retrieve(accountId, {
      expand: ["external_accounts"],
    });

    const existingExternalAccount =
      accountSnapshot.external_accounts?.data?.[0];

    if (existingExternalAccount?.id) {
      try {
        await stripe.accounts.deleteExternalAccount(
          accountId,
          existingExternalAccount.id
        );
      } catch (externalAccountError) {
        if (!isAccessRevokedError(externalAccountError, accountId)) {
          console.warn(
            "Failed to delete existing external account before replacement",
            externalAccountError
          );
        }
      }
    }

    try {
      await stripe.accounts.createExternalAccount(accountId, {
        external_account: (() => {
          const bankAccount: Stripe.AccountCreateExternalAccountParams.BankAccount =
            {
              object: "bank_account",
              country: normalizedCountry,
              currency: normalizedCurrency,
              account_number: payload.bankAccountNumber,
              account_holder_name: accountHolderName,
              account_holder_type: "individual",
            };

          const routingNumber = normalizeOptionalString(
            payload.bankRoutingNumber
          );
          if (routingNumber) {
            bankAccount.routing_number = routingNumber;
          }

          const swiftCode = normalizeOptionalString(payload.bankSwiftCode);
          if (swiftCode) {
            (bankAccount as { swift_code?: string }).swift_code = swiftCode;
          }

          return bankAccount;
        })(),
      });
    } catch (error) {
      if (isMissingCustomCapabilityError(error)) {
        return { error: customCapabilityHelpMessage };
      }
      if (isAccessRevokedError(error, accountId)) {
        await adminClient
          .from("stripe_accounts")
          .delete()
          .eq("stripe_account_id", accountId);
        return {
          error:
            "Stripe could not attach the payout bank account because access to the connected account was revoked. Please reconnect your payout account.",
        };
      }
      throw error;
    }

    const refreshedAccount = await stripe.accounts.retrieve(accountId, {
      expand: ["external_accounts"],
    });
    const record = await upsertStripeAccountRecord(user.id, refreshedAccount);

    try {
      const contributorWallet = await ensureWalletRecord(
        adminClient,
        user.id,
        record.default_currency ?? normalizedCurrency
      );
      await syncWalletFromConnectAccount(
        stripe,
        adminClient,
        contributorWallet,
        accountId,
        record.default_currency ?? normalizedCurrency
      );
    } catch (syncError) {
      console.warn("Unable to sync wallet after onboarding", syncError);
    }

    return {
      data: {
        account_id: record.stripe_account_id,
        charges_enabled: record.charges_enabled,
        payouts_enabled: record.payouts_enabled,
        requirements: record.requirements_currently_due,
      },
    };
  } catch (error) {
    console.error("Error during Stripe onboarding", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit Stripe onboarding";
    return { error: message };
  }
}

export async function deleteStripeConnectAccount() {
  assertStripeConfigured();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const stripe = getStripeServer();
  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const { data: accountRecord } = await adminClient
    .from("stripe_accounts")
    .select("id, stripe_account_id")
    .eq("user_id", user.id)
    .single();

  if (!accountRecord?.stripe_account_id) {
    return { error: "Stripe account not found" };
  }

  try {
    await stripe.accounts.del(accountRecord.stripe_account_id);
  } catch (error) {
    if (!isAccessRevokedError(error, accountRecord.stripe_account_id)) {
      console.error("Failed to delete Stripe connect account", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete Stripe account";
      return { error: message };
    }
  }

  await adminClient.from("stripe_accounts").delete().eq("id", accountRecord.id);

  try {
    const walletRecord = await ensureWalletRecord(adminClient, user.id);
    await adminClient
      .from("wallets")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", walletRecord.id);
  } catch (syncError) {
    console.warn(
      "Unable to sync wallet after Stripe account deletion",
      syncError
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/contributor");
  revalidatePath("/contributor/earnings");

  return { data: { deleted: true } };
}

export async function getStripeConnectAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const { data, error } = await adminClient
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return { data: null };
  }

  return { data };
}

export async function getStripeConnectStatus() {
  assertStripeConfigured();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const { data: accountRecord } = await adminClient
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!accountRecord) {
    return {
      data: {
        connected: false,
        account_id: null,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: [],
      },
    };
  }

  try {
    const stripe = getStripeServer();
    const account = await stripe.accounts.retrieve(
      accountRecord.stripe_account_id
    );
    const updatedRecord = await upsertStripeAccountRecord(user.id, account);

    return {
      data: {
        connected: true,
        account_id: updatedRecord.stripe_account_id,
        charges_enabled: updatedRecord.charges_enabled,
        payouts_enabled: updatedRecord.payouts_enabled,
        details_submitted: updatedRecord.details_submitted,
        requirements: updatedRecord.requirements_currently_due,
        bank_last4: updatedRecord.bank_last4,
        status: updatedRecord.status,
      },
    };
  } catch (error) {
    console.error("Failed to fetch Stripe status", error);
    return { error: "Failed to fetch Stripe account status" };
  }
}

export async function getStripeConnectBalance() {
  assertStripeConfigured();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const { data: accountRecord } = await adminClient
    .from("stripe_accounts")
    .select("stripe_account_id")
    .eq("user_id", user.id)
    .single();

  if (!accountRecord?.stripe_account_id) {
    return { error: "Stripe account not found" };
  }

  try {
    const stripe = getStripeServer();
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountRecord.stripe_account_id,
    });

    const available = balance.available?.[0];
    const pending = balance.pending?.[0];

    return {
      data: {
        available: available ? amountFromCents(available.amount) : 0,
        pending: pending ? amountFromCents(pending.amount) : 0,
        currency: (
          available?.currency ??
          pending?.currency ??
          "usd"
        ).toUpperCase(),
      },
    };
  } catch (error) {
    console.error("Failed to fetch Stripe balance", error);
    return { error: "Failed to fetch Stripe balance" };
  }
}

export async function payoutToContributor(
  submissionId: string,
  contributorId: string,
  amount: number,
  datasetId: string
) {
  assertStripeConfigured();

  const amountInCents = centsFromAmount(amount);
  const stripe = getStripeServer();
  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const { data: datasetRecord, error: datasetError } = await adminClient
    .from("dataset_requests")
    .select("currency")
    .eq("id", datasetId)
    .maybeSingle();

  const { data: accountRecord, error: accountError } = await adminClient
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", contributorId)
    .single();

  if (accountError || !accountRecord) {
    return { error: "Contributor has no Stripe account" };
  }

  if (!accountRecord.payouts_enabled) {
    return { error: "Contributor payouts are not enabled yet" };
  }

  const feeAmount = calculatePlatformFee(amountInCents);
  const netAmount = amountInCents - feeAmount;

  if (netAmount <= 0) {
    return { error: "Calculated payout is not valid" };
  }

  const accountCurrency = (
    accountRecord.default_currency ?? "usd"
  ).toLowerCase();
  const datasetCurrency = datasetRecord?.currency?.toLowerCase();
  const transferCurrency = (accountCurrency || datasetCurrency || "usd").toLowerCase();

  try {
    const transfer = await stripe.transfers.create({
      amount: netAmount,
      currency: transferCurrency,
      destination: accountRecord.stripe_account_id,
      metadata: {
        submission_id: submissionId,
        dataset_id: datasetId,
        dataset_currency: datasetCurrency ?? "usd",
      },
      description: `Payout for submission ${submissionId}`,
      transfer_group: `dataset_${datasetId}`,
    });

    const contributorWallet = await ensureWalletRecord(
      adminClient,
      contributorId,
      transferCurrency
    );

    await syncWalletFromConnectAccount(
      stripe,
      adminClient,
      contributorWallet,
      accountRecord.stripe_account_id,
      accountRecord.default_currency
    );

    await recordTransaction({
      userId: contributorId,
      direction: "credit",
      type: "submission_payout",
      amountInCents: netAmount,
      currency: transfer.currency,
      referenceId: transfer.id,
      datasetRequestId: datasetId,
      submissionId,
      metadata: {
        gross_amount: amountInCents,
        platform_fee: feeAmount,
      },
    });

    return {
      data: {
        transfer_id: transfer.id,
        net_amount: amountFromCents(netAmount),
        fee_amount: amountFromCents(feeAmount),
      },
    };
  } catch (error) {
    console.error("Failed to create Stripe transfer", error);
    const message =
      error instanceof Error ? error.message : "Failed to create payout";
    return { error: message };
  }
}

export async function refreshWalletFromStripe(paymentIntentId: string) {
  assertStripeConfigured();

  const admin = createAdminClient("payments_ledger");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const stripe = getStripeServer();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  const { data: existingTx } = await adminClient
    .from("transactions")
    .select("id")
    .eq("reference_id", paymentIntent.id)
    .maybeSingle();

  if (existingTx) {
    return { data: { success: true } };
  }

  if (paymentIntent.status !== "succeeded") {
    return { error: "Payment not successful" };
  }

  const userId = paymentIntent.metadata?.user_id;

  if (!userId) {
    return { error: "Unable to determine wallet owner" };
  }

  await recordTransaction({
    userId,
    direction: "credit",
    type: "wallet_deposit",
    amountInCents: paymentIntent.amount_received ?? paymentIntent.amount,
    currency: paymentIntent.currency,
    referenceId: paymentIntent.id,
    metadata: paymentIntent.metadata as Record<string, unknown>,
  });

  return { data: { success: true } };
}

export async function getWalletSnapshot() {
  const walletResult = await getUserWallet();
  if (walletResult.error) {
    return walletResult;
  }

  const { data, error } = await getUserTransactions(5);

  if (error) {
    return { error };
  }

  return {
    data: {
      wallet: walletResult.data,
      recentTransactions: data,
    },
  };
}
