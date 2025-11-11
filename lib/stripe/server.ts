import Stripe from 'stripe';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (SECRET_KEY && !SECRET_KEY.startsWith('sk_')) {
  console.warn(
    '[stripe] STRIPE_SECRET_KEY is present but does not begin with "sk_". Verify the correct key is configured.'
  );
}

// Only create Stripe instance if we have the secret key
export const stripe = SECRET_KEY
  ? new Stripe(SECRET_KEY, {
      apiVersion: '2024-06-20',
      typescript: true,
    })
  : null;

let hasValidatedKey = false;

const validateStripeKeyOnce = async (client: Stripe) => {
  if (hasValidatedKey) return;

  try {
    const account = await client.accounts.retrieve();
    hasValidatedKey = true;

    if (!account?.id) {
      console.warn('[stripe] Unable to determine platform account id from secret key.');
    }
  } catch (error) {
    hasValidatedKey = true;

    const message =
      error instanceof Error ? error.message : 'Unknown error validating Stripe secret key';

    console.error(
      '[stripe] Failed to validate STRIPE_SECRET_KEY. Ensure the key belongs to the platform account that owns connected accounts.',
      message
    );
  }
};

export const getStripeServer = () => {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  // Fire and forget validation so we can surface configuration issues early.
  void validateStripeKeyOnce(stripe);

  return stripe;
};
