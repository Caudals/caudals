"use server";

import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import type { Database, Json } from "@/types/database";

const PLATFORM_FEE_PERCENTAGE = Number(
  process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE ?? "10"
);

const centsFromAmount = (amount: number) =>
  Math.round(Number(amount ?? 0) * 100);
const amountFromCents = (cents: number) => Number(cents ?? 0) / 100;

type StripeAccountInsert = Database["public"]["Tables"]["stripe_accounts"]["Insert"];
type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

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
    dobYear: z
      .coerce.number()
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

const DEFAULT_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
  const admin = createAdminClient();
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
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
  const admin = createAdminClient();
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
    account_type: (account.type ?? "custom") as "custom" | "express" | "standard",
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
    requirements_currently_due: (account.requirements?.currently_due ?? []) as Json,
    requirements_past_due: (account.requirements?.past_due ?? []) as Json,
    requirements_disabled_reason: account.requirements?.disabled_reason ?? null,
    bank_status: bankStatus,
    bank_last4: bankLast4,
    last_synced_at: new Date().toISOString(),
  };

  const { error: upsertError } = await adminClient
    .from("stripe_accounts")
    .upsert(payload, { onConflict: "stripe_account_id" });

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

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const { data: wallet, error } = await adminClient
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !wallet) {
    return {
      data: {
        id: "wallet-not-initialised",
        user_id: user.id,
        balance: 0,
        available_balance: 0,
        pending_balance: 0,
        currency: "USD",
        updated_at: new Date().toISOString(),
      },
    };
  }

  return {
    data: {
      id: wallet.id,
      user_id: wallet.user_id,
      balance: amountFromCents(wallet.available_balance),
      available_balance: amountFromCents(wallet.available_balance),
      pending_balance: amountFromCents(wallet.pending_balance),
      currency: wallet.currency.toUpperCase(),
      updated_at: wallet.updated_at,
      last_synced_at: wallet.last_synced_at,
    },
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

  const admin = createAdminClient();
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

  const stripe = getStripeServer();

  try {
    if (datasetId === "wallet-funding") {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: normalizedCurrency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          user_id: user.id,
          type: "wallet_deposit",
        },
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
      .select("id, title, created_by, total_budget, commission_percentage")
      .eq("id", datasetId)
      .single();

    if (datasetError || !dataset || dataset.created_by !== user.id) {
      return { error: "Dataset not found or access denied" };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: normalizedCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        user_id: user.id,
        dataset_id: datasetId,
        type: "dataset_funding",
      },
      description: `Funding dataset ${dataset.title}`,
      transfer_group: `dataset_${datasetId}`,
    });

    await supabase
      .from("dataset_requests")
      .update({
        total_budget: amount,
        payment_status: "partial",
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
      error instanceof Error ? error.message : "Failed to create payment intent";
    return { error: message };
  }
}

export async function confirmPayment(paymentIntentId: string) {
  assertStripeConfigured();

  const supabase = await createClient();
  const stripe = getStripeServer();

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

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

      return { data: { success: true } };
    }

    if (metadata.type === "dataset_funding" && metadata.dataset_id) {
      const datasetId = metadata.dataset_id;

      await recordTransaction({
        userId,
        direction: "debit",
        type: "dataset_funding",
        amountInCents: paymentIntent.amount_received ?? paymentIntent.amount,
        currency: paymentIntent.currency,
        referenceId: paymentIntent.id,
        datasetRequestId: datasetId,
        metadata: metadata as Record<string, unknown>,
      });

      await supabase
        .from("dataset_requests")
        .update({
          payment_status: "paid",
          paid_amount: (paymentIntent.amount_received ?? paymentIntent.amount) / 100,
        })
        .eq("id", datasetId);

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

  const admin = createAdminClient();
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
    .select("id, title, commission_percentage")
    .eq("id", datasetId)
    .single();

  if (datasetError || !dataset) {
    return { error: "Dataset not found" };
  }

  await recordTransaction({
    userId: user.id,
    direction: "debit",
    type: "dataset_funding",
    amountInCents,
    currency: wallet.currency,
    referenceId: `wallet-${Date.now()}`,
    datasetRequestId: datasetId,
    metadata: {
      source: "wallet",
    },
  });

  await supabase
    .from("dataset_requests")
    .update({
      payment_status: "paid",
      paid_amount: amount,
    })
    .eq("id", datasetId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");

  return {
    data: {
      success: true,
    },
  };
}

export async function submitStripeOnboarding(rawInput: StripeOnboardingPayload) {
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
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const fallbackIp = forwardedFor?.split(",")?.[0]?.trim();
  const ipForTos =
    payload.ipAddress && payload.ipAddress !== "127.0.0.1"
      ? payload.ipAddress
      : fallbackIp ?? "127.0.0.1";

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
    if (!existingAccount) {
      const createdAccount = await stripe.accounts.create({
        type: "custom",
        country: normalizedCountry,
        email: payload.email ?? profile?.mail ?? user.email ?? undefined,
        business_type: "individual",
        capabilities: {
          transfers: { requested: true },
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: ipForTos,
        },
        business_profile: {
          product_description:
            "Receives payouts for contributing datasets via Collective Dataset Platform",
          mcc: "5734", // Computer software stores
          url: DEFAULT_APP_URL,
        },
      });

      await upsertStripeAccountRecord(user.id, createdAccount);
    }

    let accountId = existingAccount?.stripe_account_id ?? null;

    if (!accountId) {
      const lookup = await adminClient
        .from("stripe_accounts")
        .select("stripe_account_id")
        .eq("user_id", user.id)
        .single();

      accountId = lookup.data?.stripe_account_id ?? null;
    }

    if (!accountId) {
      throw new Error("Failed to create Stripe Connect account");
    }

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

    await stripe.accounts.update(accountId, {
      individual,
      default_currency: normalizedCurrency,
      settings: {
        payouts: {
          schedule: {
            interval: "daily",
          },
        },
      },
    });

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
        console.warn(
          "Failed to delete existing external account before replacement",
          externalAccountError
        );
      }
    }

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

        const routingNumber = normalizeOptionalString(payload.bankRoutingNumber);
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

    const refreshedAccount = await stripe.accounts.retrieve(accountId, {
      expand: ["external_accounts"],
    });
    const record = await upsertStripeAccountRecord(user.id, refreshedAccount);

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
      error instanceof Error ? error.message : "Failed to submit Stripe onboarding";
    return { error: message };
  }
}

export async function getStripeConnectAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const admin = createAdminClient();
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

  const admin = createAdminClient();
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
    const account = await stripe.accounts.retrieve(accountRecord.stripe_account_id);
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

  const admin = createAdminClient();
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
        available: available
          ? amountFromCents(available.amount)
          : 0,
        pending: pending ? amountFromCents(pending.amount) : 0,
        currency: (available?.currency ?? pending?.currency ?? "usd").toUpperCase(),
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
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

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

  try {
    const transfer = await stripe.transfers.create({
      amount: netAmount,
      currency: accountRecord.default_currency ?? "usd",
      destination: accountRecord.stripe_account_id,
      metadata: {
        submission_id: submissionId,
        dataset_id: datasetId,
      },
      description: `Payout for submission ${submissionId}`,
      transfer_group: `dataset_${datasetId}`,
    });

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

  const stripe = getStripeServer();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

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
