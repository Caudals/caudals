-- Add SECURITY DEFINER to existing wallet balance function to bypass RLS
-- This allows the trigger to create/update wallets even when called from webhooks

CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER
SET search_path = public
SECURITY DEFINER
AS $$
DECLARE
    wallet_record wallets%ROWTYPE;
BEGIN
    -- Get current wallet
    SELECT * INTO wallet_record FROM wallets WHERE user_id = NEW.user_id;
    
    -- If no wallet exists, create one (this was already implemented in migration 004)
    IF NOT FOUND THEN
        INSERT INTO wallets (user_id, balance, currency)
        VALUES (NEW.user_id, 0.00, COALESCE(NEW.currency, 'USD'))
        RETURNING * INTO wallet_record;
    END IF;
    
    -- Only update if this is a new completed transaction (not already processed)
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'completed') THEN
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
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add SECURITY DEFINER to the profile wallet creation function too
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO wallets (user_id, balance, currency)
    VALUES (NEW.id, 0.00, 'USD');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: create wallets for any existing profiles missing one
-- This will be executed with elevated privileges due to SECURITY DEFINER functions
INSERT INTO wallets (user_id, balance, currency)
SELECT p.id, 0.00, 'USD'
FROM profiles p
LEFT JOIN wallets w ON w.user_id = p.id
WHERE w.user_id IS NULL;


