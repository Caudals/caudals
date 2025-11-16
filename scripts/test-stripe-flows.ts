#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import Stripe from "stripe";

type StepResult = {
  step: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

const REQUIRED_ENVS = ["STRIPE_SECRET_KEY"];

function validateEnv(): void {
  const missing = REQUIRED_ENVS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

function parseCliFlags() {
  const flags = new Map<string, string | true>();

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=", 2);
      flags.set(key, value ?? true);
    }
  }

  return {
    reuseAccountId: (flags.get("reuse-account") as string | undefined) ?? null,
    createConnectedAccount: flags.has("skip-connect") ? false : true,
    createPaymentIntent: flags.has("skip-payment") ? false : true,
    amountCents: flags.has("amount") ? Number(flags.get("amount")) : 2_500,
    currency: (flags.get("currency") as string | undefined) ?? "eur",
    cleanupAccount: flags.has("keep-account") ? false : true,
  };
}

async function main() {
  validateEnv();
  const options = parseCliFlags();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    typescript: true,
  });

  const results: StepResult[] = [];
  const logResult = (result: StepResult) => {
    results.push(result);
    const prefix = result.success ? "✅" : "❌";
    console.log(`${prefix} ${result.step}`);
    if (result.data) {
      console.dir(result.data, { depth: 5 });
    }
    if (!result.success && result.error) {
      console.error(result.error);
    }
  };

  let connectedAccountId = options.reuseAccountId ?? null;
  let createdConnectedAccount = false;

  const businessProfileUrl =
    process.env.STRIPE_TEST_BUSINESS_URL ?? "https://caudals.com";

  try {
    const account = await stripe.accounts.retrieve();
    logResult({
      step: "platform.account",
      success: true,
      data: {
        id: account.id,
        business_type: account.business_type,
        default_currency: account.default_currency,
        capabilities: account.capabilities,
      },
    });
  } catch (error) {
    logResult({
      step: "platform.account",
      success: false,
      error: String(error),
    });
  }

  if (options.createConnectedAccount && !connectedAccountId) {
    try {
      console.log(
        "Creating test connect account with business URL:",
        businessProfileUrl
      );
      const account = await stripe.accounts.create({
        type: "custom",
        business_type: "individual",
        country: "ES",
        email: "alice.connect@example.com",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          product_description:
            "Receives payouts for Caudals contributor earnings (test)",
          mcc: "5734",
          url: businessProfileUrl,
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: "127.0.0.1",
        },
        individual: {
          first_name: "Alice",
          last_name: "Tester",
          email: "alice.connect@example.com",
          dob: { day: 1, month: 1, year: 1990 },
          address: {
            line1: "123 Market Street",
            city: "Valladolid",
            state: "Valladolid",
            postal_code: "47008",
            country: "ES",
          },
          phone: "0000000000",
          /*ssn_last_4: "0000",
           */
        },
      });

      const externalAccount = await stripe.accounts.createExternalAccount(
        account.id,
        {
          external_account: {
            object: "bank_account",
            country: "ES",
            currency: "eur",
            account_holder_name: "Alice Tester",
            account_holder_type: "individual",
            /*routing_number: "110000000",
             */
            account_number: "ES0700120345030000067890",
          },
        }
      );

      connectedAccountId = account.id;
      createdConnectedAccount = true;
      logResult({
        step: "connect.account",
        success: true,
        data: {
          id: account.id,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          requirements: account.requirements?.currently_due,
          external_account: externalAccount.id,
        },
      });
    } catch (error) {
      logResult({
        step: "connect.account",
        success: false,
        error: String(error),
      });
    }
  }

  let paymentIntentId: string | null = null;
  let customerId: string | null = null;

  if (options.createPaymentIntent) {
    try {
      const customer = await stripe.customers.create({
        email: "requester@example.com",
        name: "Requester QA",
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: options.amountCents,
        currency: options.currency,
        customer: customer.id,
        payment_method: "pm_card_visa",
        confirm: true,
        off_session: true,
        metadata: {
          test_run: "stripe-flow-script",
        },
      });

      paymentIntentId = paymentIntent.id;
      customerId = customer.id;

      logResult({
        step: "payments.intent",
        success: true,
        data: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          customer: customer.id,
        },
      });
    } catch (error) {
      logResult({
        step: "payments.intent",
        success: false,
        error: String(error),
      });
    }
  }

  if (connectedAccountId && paymentIntentId) {
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.max(0, Math.floor(options.amountCents * 0.9)),
        currency: options.currency,
        destination: connectedAccountId,
        metadata: {
          payment_intent: paymentIntentId,
          customer: customerId ?? "",
        },
        description: "Automated payout test",
      });

      logResult({
        step: "connect.transfer",
        success: true,
        data: {
          id: transfer.id,
          amount: transfer.amount,
          currency: transfer.currency,
          destination: transfer.destination,
        },
      });
    } catch (error) {
      logResult({
        step: "connect.transfer",
        success: false,
        error: String(error),
      });
    }
  }

  if (createdConnectedAccount && options.cleanupAccount && connectedAccountId) {
    try {
      await stripe.accounts.del(connectedAccountId);
      logResult({
        step: "connect.teardown",
        success: true,
        data: { id: connectedAccountId },
      });
    } catch (error) {
      logResult({
        step: "connect.teardown",
        success: false,
        error: String(error),
      });
    }
  }

  const success = results.every((result) => result.success);

  console.log("\nSummary:");
  console.table(
    results.map((result) => ({
      step: result.step,
      success: result.success,
      error: result.error ?? "",
    }))
  );

  if (!success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Fatal error running Stripe test flows", error);
  process.exitCode = 1;
});
