-- Migration for Payment System
-- This adds tables for wallets, transactions, and Stripe Connect integration

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create wallets table for user balances
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    balance DECIMAL(10, 2) DEFAULT 0.00 CHECK (balance >= 0),
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create transactions table for payment history
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'payment', 'payout', 'refund', 'commission')),
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    description TEXT,
    reference_id TEXT, -- Stripe payment intent ID, transfer ID, etc.
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create stripe_accounts table for Connect accounts
CREATE TABLE IF NOT EXISTS stripe_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stripe_account_id TEXT NOT NULL UNIQUE,
    account_type TEXT DEFAULT 'express' CHECK (account_type IN ('express', 'standard', 'custom')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'restricted', 'rejected')),
    charges_enabled BOOLEAN DEFAULT FALSE,
    payouts_enabled BOOLEAN DEFAULT FALSE,
    details_submitted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Add funding fields to dataset_requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'funding_model') THEN
    ALTER TABLE dataset_requests ADD COLUMN funding_model TEXT DEFAULT 'upfront' CHECK (funding_model IN ('upfront', 'per_contribution'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'total_budget') THEN
    ALTER TABLE dataset_requests ADD COLUMN total_budget DECIMAL(10, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'paid_amount') THEN
    ALTER TABLE dataset_requests ADD COLUMN paid_amount DECIMAL(10, 2) DEFAULT 0.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'payment_status') THEN
    ALTER TABLE dataset_requests ADD COLUMN payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'stripe_payment_intent_id') THEN
    ALTER TABLE dataset_requests ADD COLUMN stripe_payment_intent_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_requests' AND column_name = 'commission_percentage') THEN
    ALTER TABLE dataset_requests ADD COLUMN commission_percentage DECIMAL(5, 2) DEFAULT 10.00;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_user_id ON stripe_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_stripe_account_id ON stripe_accounts(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_dataset_requests_payment_status ON dataset_requests(payment_status);

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stripe_accounts_updated_at ON stripe_accounts;
CREATE TRIGGER update_stripe_accounts_updated_at BEFORE UPDATE ON stripe_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create wallet for new users
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallets (user_id, balance, currency)
    VALUES (NEW.id, 0.00, 'USD');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create wallet on profile creation
DROP TRIGGER IF EXISTS on_profile_created_wallet ON profiles;
CREATE TRIGGER on_profile_created_wallet
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION create_user_wallet();

-- Function to update wallet balance on transaction
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
    wallet_record wallets%ROWTYPE;
BEGIN
    -- Get current wallet
    SELECT * INTO wallet_record FROM wallets WHERE user_id = NEW.user_id;
    
    -- Update balance based on transaction type
    IF NEW.type = 'deposit' OR NEW.type = 'payout' THEN
        UPDATE wallets 
        SET balance = balance + NEW.amount,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    ELSIF NEW.type = 'withdrawal' OR NEW.type = 'payment' OR NEW.type = 'commission' THEN
        UPDATE wallets 
        SET balance = balance - NEW.amount,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update wallet balance on transaction completion
DROP TRIGGER IF EXISTS on_transaction_completed ON transactions;
CREATE TRIGGER on_transaction_completed
    AFTER UPDATE OF status ON transactions
    FOR EACH ROW 
    WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION update_wallet_balance();

-- RLS Policies for wallets
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet" ON wallets;
CREATE POLICY "Users can view own wallet" ON wallets
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wallet" ON wallets;
CREATE POLICY "Users can insert own wallet" ON wallets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wallet" ON wallets;
CREATE POLICY "Users can update own wallet" ON wallets
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert transactions" ON transactions;
CREATE POLICY "System can insert transactions" ON transactions
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "System can update transactions" ON transactions;
CREATE POLICY "System can update transactions" ON transactions
    FOR UPDATE WITH CHECK (true);

-- RLS Policies for stripe_accounts
ALTER TABLE stripe_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own stripe account" ON stripe_accounts;
CREATE POLICY "Users can view own stripe account" ON stripe_accounts
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own stripe account" ON stripe_accounts;
CREATE POLICY "Users can insert own stripe account" ON stripe_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own stripe account" ON stripe_accounts;
CREATE POLICY "Users can update own stripe account" ON stripe_accounts
    FOR UPDATE USING (auth.uid() = user_id);

-- Admin policies
DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
CREATE POLICY "Admins can view all wallets" ON wallets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
CREATE POLICY "Admins can view all transactions" ON transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view all stripe accounts" ON stripe_accounts;
CREATE POLICY "Admins can view all stripe accounts" ON stripe_accounts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
