"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/server";
import { revalidatePath } from "next/cache";

// Create payment intent for dataset request funding or wallet funding
export async function createPaymentIntent(
  datasetId: string,
  amount: number,
  currency: string = "USD"
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Handle wallet funding (special case)
  if (datasetId === "wallet-funding") {
    try {
      const stripe = getStripeServer();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata: {
          user_id: user.id,
          type: "wallet_funding",
        },
        description: `Wallet funding for user`,
      });

      return {
        data: {
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id,
        },
      };
    } catch (error) {
      console.error("Error creating wallet funding payment intent:", error);
      return { error: "Failed to create payment intent" };
    }
  }

  // Verify user owns the dataset request
  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id, created_by, title, total_budget")
    .eq("id", datasetId)
    .eq("created_by", user.id)
    .single();

  if (datasetError || !dataset) {
    return { error: "Dataset not found or access denied" };
  }

  try {
    // Create payment intent - funds go to platform account
    // NOTE: Application fees are NOT used here because requester payments go TO the platform
    // Platform commission (10%) is deducted during contributor payouts via Stripe Transfers
    const stripe = getStripeServer();

    console.log("Creating PaymentIntent for dataset funding:", {
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      datasetId,
      userId: user.id
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      // NO application_fee_amount - this is a direct payment to platform
      metadata: {
        dataset_id: datasetId,
        user_id: user.id,
        type: "dataset_funding",
      },
      description: `Funding for dataset: ${dataset.title}`,
    });

    console.log("PaymentIntent created successfully:", {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret ? "present" : "missing",
      status: paymentIntent.status
    });

    // Update dataset with payment intent ID
    await supabase
      .from("dataset_requests")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        total_budget: amount,
      })
      .eq("id", datasetId);

    return {
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      },
    };
  } catch (error: unknown) {
    console.error("Error creating payment intent:", error);
    
    // More detailed error handling
    if (typeof error === "object" && error !== null) {
      const maybeAny = error as { [key: string]: unknown };
      const type = typeof maybeAny["type"] === "string" ? (maybeAny["type"] as string) : undefined;
      const code = typeof maybeAny["code"] === "string" ? (maybeAny["code"] as string) : undefined;
      const message = typeof maybeAny["message"] === "string" ? (maybeAny["message"] as string) : undefined;

      if (type === "StripeInvalidRequestError") {
        console.error("Stripe validation error:", message);
        return { error: `Stripe error: ${message ?? "Invalid request"}` };
      }
      
      if (code === "application_fee_not_allowed") {
        console.error("Application fee not allowed - Connect may not be set up properly");
        return { error: "Payment system configuration error. Please contact support." };
      }

      return { error: `Failed to create payment intent: ${message ?? "Unknown error"}` };
    }

    return { error: "Failed to create payment intent: Unknown error" };
  }
}

// Confirm payment and update dataset status
export async function confirmPayment(paymentIntentId: string) {
  const supabase = await createClient();

  try {
    // Retrieve payment intent from Stripe
    const stripe = getStripeServer();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return { error: "Payment not successful" };
    }

    const datasetId = paymentIntent.metadata.dataset_id;
    const userId = paymentIntent.metadata.user_id;

    // Update dataset payment status
    const { error: updateError } = await supabase
      .from("dataset_requests")
      .update({
        payment_status: "paid",
        paid_amount: paymentIntent.amount / 100, // Convert from cents
      })
      .eq("id", datasetId);

    if (updateError) {
      console.error("Error updating dataset:", updateError);
      return { error: "Failed to update dataset" };
    }

    // Create transaction record
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "payment",
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: "completed",
        description: `Payment for dataset funding`,
        reference_id: paymentIntentId,
        metadata: {
          dataset_id: datasetId,
          stripe_payment_intent: paymentIntentId,
        },
      });

    if (transactionError) {
      console.error("Error creating transaction:", transactionError);
    }

    revalidatePath("/dashboard/requests");
    revalidatePath("/dashboard/billing");

    return { data: { success: true } };
  } catch (error) {
    console.error("Error confirming payment:", error);
    return { error: "Failed to confirm payment" };
  }
}

// Get user's wallet balance
export async function getUserWallet() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("Error fetching wallet:", error);

      // If wallet doesn't exist, return a default wallet object
      if (
        error.code === "PGRST116" ||
        error.message?.includes("No rows found")
      ) {
        console.log(
          "Wallet not found, returning default wallet for user:",
          user.id
        );
        return {
          data: {
            id: "default",
            user_id: user.id,
            balance: 0.0,
            currency: "USD",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }

      return { error: `Failed to fetch wallet: ${error.message}` };
    }
    return { data: wallet };
  } catch (error) {
    console.error("Unexpected error in getUserWallet:", error);
    return { error: "Unexpected error occurred" };
  }
}

// Get user's transaction history
export async function getUserTransactions(limit: number = 50) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching transactions:", error);
    return { error: "Failed to fetch transactions" };
  }

  return { data: transactions };
}

// Create Stripe Connect account for contributor
export async function createStripeConnectAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user already has a Stripe account
  const { data: existingAccount } = await supabase
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (existingAccount) {
    return {
      data: {
        account_id: existingAccount.stripe_account_id,
        onboarding_url: null, // Already onboarded
      },
    };
  }

  try {
    // Get user profile for account creation
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, mail")
      .eq("id", user.id)
      .single();

    // Create Stripe Connect Express account
    const stripe = getStripeServer();
    const account = await stripe.accounts.create({
      type: "express",
      country: "US", // You might want to make this configurable
      email: profile?.mail || user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        user_id: user.id,
        platform: "collective-dataset",
      },
    });

    // Save account to database
    const { error: saveError } = await supabase.from("stripe_accounts").insert({
      user_id: user.id,
      stripe_account_id: account.id,
      account_type: "express",
      status: "pending",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });

    if (saveError) {
      console.error("Error saving Stripe account:", saveError);
      return { error: "Failed to save account" };
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/dashboard/wallet?refresh=true`,
      return_url: `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/dashboard/wallet?success=true`,
      type: "account_onboarding",
    });

    return {
      data: {
        account_id: account.id,
        onboarding_url: accountLink.url,
      },
    };
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    return { error: "Failed to create Stripe account" };
  }
}

// Get Stripe Connect account status
export async function getStripeConnectAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: account, error } = await supabase
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    return { data: null }; // No account created yet
  }

  return { data: account };
}

// Pay for dataset using wallet balance
export async function payWithWallet(datasetId: string, amount: number) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  try {
    // Get user's wallet
    let wallet;
    const { data: walletData, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (walletError || !walletData) {
      // If wallet doesn't exist, treat as having 0 balance
      if (
        walletError?.code === "PGRST116" ||
        walletError?.message?.includes("No rows found")
      ) {
        if (amount > 0) {
          return { error: "Insufficient wallet balance" };
        }
        // If amount is 0, continue with the process
        wallet = { balance: 0 };
      } else {
        return { error: "Wallet not found" };
      }
    } else {
      wallet = walletData;
    }

    if (wallet.balance < amount) {
      return { error: "Insufficient wallet balance" };
    }

    // Verify user owns the dataset request
    const { data: dataset, error: datasetError } = await supabase
      .from("dataset_requests")
      .select("id, created_by, title, total_budget")
      .eq("id", datasetId)
      .eq("created_by", user.id)
      .single();

    if (datasetError || !dataset) {
      return { error: "Dataset not found or access denied" };
    }

    // Deduct amount from wallet
    const newBalance = wallet.balance - amount;
    const { error: updateWalletError } = await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", user.id);

    if (updateWalletError) {
      return { error: "Failed to update wallet balance" };
    }

    // Update dataset payment status
    const { error: updateDatasetError } = await supabase
      .from("dataset_requests")
      .update({
        payment_status: "paid",
        paid_amount: amount,
        total_budget: amount,
      })
      .eq("id", datasetId);

    if (updateDatasetError) {
      // Rollback wallet update
      await supabase
        .from("wallets")
        .update({ balance: wallet.balance })
        .eq("user_id", user.id);
      return { error: "Failed to update dataset" };
    }

    // Create transaction record
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount: amount,
        currency: "USD",
        status: "completed",
        description: `Dataset funding payment (wallet)`,
        reference_id: `wallet-${Date.now()}`,
        metadata: {
          dataset_id: datasetId,
          payment_method: "wallet",
        },
      });

    if (transactionError) {
      console.error("Error creating transaction:", transactionError);
    }

    revalidatePath("/dashboard/requests");
    revalidatePath("/dashboard/billing");

    return { data: { success: true, newBalance } };
  } catch (error) {
    console.error("Error paying with wallet:", error);
    return { error: "Failed to process wallet payment" };
  }
}

// Payout to contributor - adds funds to their internal wallet
// Contributor can later withdraw to their bank account
export async function payoutToContributor(
  submissionId: string,
  contributorId: string,
  amount: number,
  datasetId: string
) {
  const supabase = await createClient();

  try {
    // Calculate net amount after platform fee (10%)
    const platformFeePercentage = 0.1;
    const platformFee = amount * platformFeePercentage;
    const netAmount = amount - platformFee;

    // Create payout transaction for contributor
    // This will automatically update the wallet balance via database trigger
    const { data: payoutTx, error: payoutTxError } = await supabase
      .from("transactions")
      .insert({
        user_id: contributorId,
        type: "payout",
        amount: netAmount,
        currency: "USD",
        status: "completed",
        description: `Contribution reward for approved submission`,
        reference_id: `submission-${submissionId}`,
        metadata: {
          submission_id: submissionId,
          dataset_id: datasetId,
          gross_amount: amount,
          platform_fee: platformFee,
          net_amount: netAmount,
        },
      })
      .select()
      .single();

    if (payoutTxError) {
      console.error("Error recording payout transaction:", payoutTxError);
      return { error: "Failed to create payout transaction" };
    }

    // Record platform commission transaction
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    await supabase.from("transactions").insert({
      user_id: currentUser?.id || contributorId, // Platform user or fallback
      type: "commission",
      amount: platformFee,
      currency: "USD",
      status: "completed",
      description: `Platform commission (10%) from submission`,
      reference_id: `commission-${submissionId}`,
      metadata: {
        submission_id: submissionId,
        dataset_id: datasetId,
        contributor_id: contributorId,
        gross_amount: amount,
      },
    });

    console.log(
      `✅ Payout successful: $${netAmount} added to contributor ${contributorId} wallet`
    );

    // Verify wallet was updated
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", contributorId)
      .single();

    if (wallet) {
      console.log(`💰 Contributor wallet balance: $${wallet.balance}`);
    }

    return {
      data: {
        transaction_id: payoutTx.id,
        net_amount: netAmount,
        platform_fee: platformFee,
        success: true,
      },
    };
  } catch (error) {
    console.error("Error processing payout:", error);
    return { error: "Failed to process payout to contributor" };
  }
}
