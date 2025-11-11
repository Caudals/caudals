-- Add Stripe customer linkage for requester wallets

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_stripe_customer_id
  ON public.wallets(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;



