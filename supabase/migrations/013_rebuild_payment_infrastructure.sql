-- Rebuild payment and wallet infrastructure to align with Stripe Connect flows
-- This migration is idempotent and safe to run multiple times.

-- Ensure crypto extension is available for uuid generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Wallets table to track user balances that mirror Stripe balances (values stored in cents)
CREATE TABLE IF NOT EXISTS public.wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    available_balance bigint NOT NULL DEFAULT 0, -- amount in cents
    pending_balance bigint NOT NULL DEFAULT 0, -- pending funds in cents
    currency text NOT NULL DEFAULT 'usd',
    last_synced_at timestamptz DEFAULT NOW(),
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- Transactions table keeps ledger entries for all wallet-affecting operations
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
    type text NOT NULL CHECK (type IN (
        'wallet_deposit',
        'wallet_withdrawal',
        'dataset_funding',
        'submission_payout',
        'platform_fee',
        'stripe_adjustment',
        'refund'
    )),
    amount bigint NOT NULL, -- amount in cents, always positive
    fee_amount bigint DEFAULT 0, -- fee taken from amount (cents)
    net_amount bigint GENERATED ALWAYS AS (amount - COALESCE(fee_amount, 0)) STORED,
    currency text NOT NULL DEFAULT 'usd',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    reference_id text,
    dataset_request_id uuid REFERENCES public.dataset_requests(id) ON DELETE SET NULL,
    submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
    source_type text NOT NULL DEFAULT 'stripe',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Stripe connected accounts table keeps sync status and requirements
CREATE TABLE IF NOT EXISTS public.stripe_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_account_id text NOT NULL UNIQUE,
    account_type text NOT NULL DEFAULT 'custom' CHECK (account_type IN ('custom', 'express', 'standard')),
    country text NOT NULL DEFAULT 'US',
    default_currency text NOT NULL DEFAULT 'usd',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'restricted', 'rejected')),
    charges_enabled boolean NOT NULL DEFAULT false,
    payouts_enabled boolean NOT NULL DEFAULT false,
    details_submitted boolean NOT NULL DEFAULT false,
    requirements_currently_due jsonb DEFAULT '[]'::jsonb,
    requirements_past_due jsonb DEFAULT '[]'::jsonb,
    requirements_disabled_reason text,
    bank_status text,
    bank_last4 text,
    last_synced_at timestamptz DEFAULT NOW(),
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- Ensure dataset requests contain necessary payment metadata columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'funding_model') THEN
        ALTER TABLE public.dataset_requests ADD COLUMN funding_model text DEFAULT 'upfront' CHECK (funding_model IN ('upfront', 'per_contribution'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'total_budget') THEN
        ALTER TABLE public.dataset_requests ADD COLUMN total_budget numeric(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'paid_amount') THEN
        ALTER TABLE public.dataset_requests ADD COLUMN paid_amount numeric(12,2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'payment_status') THEN
        ALTER TABLE public.dataset_requests ADD COLUMN payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'stripe_payment_intent_id') THEN
        ALTER TABLE public.dataset_requests ADD COLUMN stripe_payment_intent_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'commission_percentage') THEN
        ALTER TABLE public.dataset_requests ADD COLUMN commission_percentage numeric(5,2) DEFAULT 10.00;
    END IF;
END $$;

-- Indexes for faster lookup
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS dataset_request_id uuid REFERENCES public.dataset_requests(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_dataset_id ON public.transactions(dataset_request_id);
CREATE INDEX IF NOT EXISTS idx_transactions_submission_id ON public.transactions(submission_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON public.transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_user_id ON public.stripe_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_status ON public.stripe_accounts(status);

-- Helper function to upsert wallets safely
CREATE OR REPLACE FUNCTION public.ensure_wallet_exists(target_user_id uuid, target_currency text DEFAULT 'usd')
RETURNS public.wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    wallet_record public.wallets;
BEGIN
    SELECT * INTO wallet_record
    FROM public.wallets
    WHERE user_id = target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.wallets(user_id, currency)
        VALUES (target_user_id, COALESCE(target_currency, 'usd'))
        RETURNING * INTO wallet_record;
    END IF;

    RETURN wallet_record;
END;
$$;

-- Trigger function to recalculate wallet balances based on completed transactions
CREATE OR REPLACE FUNCTION public.apply_transaction_to_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    wallet_record public.wallets;
    delta_amount bigint := NEW.net_amount;
BEGIN
    IF NEW.status <> 'completed' THEN
        RETURN NEW;
    END IF;

    wallet_record := public.ensure_wallet_exists(NEW.user_id, NEW.currency);

    IF NEW.direction = 'credit' THEN
        UPDATE public.wallets
        SET available_balance = available_balance + delta_amount,
            updated_at = NOW(),
            last_synced_at = NOW()
        WHERE id = wallet_record.id;
    ELSE
        UPDATE public.wallets
        SET available_balance = GREATEST(0, available_balance - delta_amount),
            updated_at = NOW(),
            last_synced_at = NOW()
        WHERE id = wallet_record.id;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger to rollback wallet balance if transaction status changes away from completed
CREATE OR REPLACE FUNCTION public.revert_transaction_from_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    wallet_record public.wallets;
    delta_amount bigint := OLD.net_amount;
BEGIN
    IF OLD.status <> 'completed' THEN
        RETURN OLD;
    END IF;

    wallet_record := public.ensure_wallet_exists(OLD.user_id, OLD.currency);

    IF OLD.direction = 'credit' THEN
        UPDATE public.wallets
        SET available_balance = GREATEST(0, available_balance - delta_amount),
            updated_at = NOW(),
            last_synced_at = NOW()
        WHERE id = wallet_record.id;
    ELSE
        UPDATE public.wallets
        SET available_balance = available_balance + delta_amount,
            updated_at = NOW(),
            last_synced_at = NOW()
        WHERE id = wallet_record.id;
    END IF;

    RETURN OLD;
END;
$$;

-- Attach triggers to transactions table
DROP TRIGGER IF EXISTS trg_transactions_apply ON public.transactions;
CREATE TRIGGER trg_transactions_apply
AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.apply_transaction_to_wallet();

DROP TRIGGER IF EXISTS trg_transactions_revert ON public.transactions;
CREATE TRIGGER trg_transactions_revert
AFTER UPDATE ON public.transactions
FOR EACH ROW
WHEN (OLD.status = 'completed' AND NEW.status <> 'completed')
EXECUTE FUNCTION public.revert_transaction_from_wallet();

-- Trigger to keep wallets.updated_at fresh
DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to keep stripe_accounts.updated_at fresh
DROP TRIGGER IF EXISTS trg_stripe_accounts_updated_at ON public.stripe_accounts;
CREATE TRIGGER trg_stripe_accounts_updated_at
BEFORE UPDATE ON public.stripe_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable row level security and policies
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Wallet policies
DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own" ON public.wallets
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
CREATE POLICY "wallets_update_own" ON public.wallets
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_insert_service" ON public.wallets;
CREATE POLICY "wallets_insert_service" ON public.wallets
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Transaction policies
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own" ON public.transactions
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_insert_service" ON public.transactions;
CREATE POLICY "transactions_insert_service" ON public.transactions
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "transactions_update_service" ON public.transactions;
CREATE POLICY "transactions_update_service" ON public.transactions
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Stripe accounts policies
DROP POLICY IF EXISTS "stripe_accounts_select_own" ON public.stripe_accounts;
CREATE POLICY "stripe_accounts_select_own" ON public.stripe_accounts
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "stripe_accounts_insert_service" ON public.stripe_accounts;
CREATE POLICY "stripe_accounts_insert_service" ON public.stripe_accounts
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "stripe_accounts_update_service" ON public.stripe_accounts;
CREATE POLICY "stripe_accounts_update_service" ON public.stripe_accounts
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Admin override policies
DROP POLICY IF EXISTS "wallets_admin_read" ON public.wallets;
CREATE POLICY "wallets_admin_read" ON public.wallets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "transactions_admin_read" ON public.transactions;
CREATE POLICY "transactions_admin_read" ON public.transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "stripe_accounts_admin_read" ON public.stripe_accounts;
CREATE POLICY "stripe_accounts_admin_read" ON public.stripe_accounts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Backfill wallets for existing profiles (safe guard)
INSERT INTO public.wallets (user_id, currency)
SELECT p.id, 'usd'
FROM public.profiles p
LEFT JOIN public.wallets w ON w.user_id = p.id
WHERE w.id IS NULL;

-- Ensure dataset_requests default commission is within sensible limit
UPDATE public.dataset_requests
SET commission_percentage = COALESCE(commission_percentage, 10.00);
