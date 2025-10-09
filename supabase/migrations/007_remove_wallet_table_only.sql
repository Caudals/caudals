-- Migration to remove only the wallets table and its triggers
-- This keeps the payment system intact but removes the problematic wallet table

-- Drop the trigger that creates wallets on profile creation
DROP TRIGGER IF EXISTS on_profile_created_wallet ON profiles;

-- Drop the function that creates wallets
DROP FUNCTION IF EXISTS create_user_wallet();

-- Drop only the wallets table (keep transactions and stripe_accounts)
DROP TABLE IF EXISTS wallets CASCADE;

-- Remove wallet-related columns from dataset_requests (these are not needed if using Stripe directly)
ALTER TABLE dataset_requests 
DROP COLUMN IF EXISTS funding_model,
DROP COLUMN IF EXISTS total_budget,
DROP COLUMN IF EXISTS paid_amount,
DROP COLUMN IF EXISTS payment_status,
DROP COLUMN IF EXISTS stripe_payment_intent_id,
DROP COLUMN IF EXISTS commission_percentage;

-- Drop wallet-specific indexes
DROP INDEX IF EXISTS idx_wallets_user_id;
DROP INDEX IF EXISTS idx_dataset_requests_payment_status;
