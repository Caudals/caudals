-- Ensure stripe_accounts table has bank metadata columns expected by the app
ALTER TABLE public.stripe_accounts
    ADD COLUMN IF NOT EXISTS bank_status text;

ALTER TABLE public.stripe_accounts
    ADD COLUMN IF NOT EXISTS bank_last4 text;

-- Refresh PostgREST schema cache so the columns become immediately available
NOTIFY pgrst, 'reload schema';


