-- Fix wallet balance trigger to fire on INSERT as well as UPDATE
-- This ensures that wallets are updated when transactions are created with 'completed' status

-- Drop the existing trigger
DROP TRIGGER IF EXISTS on_transaction_completed ON transactions;

-- Recreate the trigger to handle both INSERT and UPDATE
CREATE TRIGGER on_transaction_completed
    AFTER INSERT OR UPDATE OF status ON transactions
    FOR EACH ROW 
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION update_wallet_balance();

-- Also update the wallet balance function to be more robust
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
    wallet_record wallets%ROWTYPE;
BEGIN
    -- Get current wallet
    SELECT * INTO wallet_record FROM wallets WHERE user_id = NEW.user_id;
    
    -- If no wallet exists, create one
    IF NOT FOUND THEN
        INSERT INTO wallets (user_id, balance, currency)
        VALUES (NEW.user_id, 0.00, NEW.currency)
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

