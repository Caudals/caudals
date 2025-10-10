-- Comprehensive fix for user_role enum
-- This migration properly removes 'both' and ensures only 'contributor', 'requester', 'admin' exist

-- Step 1: Update any existing profiles with 'both' role to 'contributor'
UPDATE profiles SET role = 'contributor' WHERE role = 'both';

-- Step 2: Drop ALL policies on tables that might reference the role column
-- Use DO blocks to drop all policies dynamically
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Drop all policies on dataset_requests
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'dataset_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON dataset_requests', pol.policyname);
  END LOOP;
  
  -- Drop all policies on submissions
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'submissions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON submissions', pol.policyname);
  END LOOP;
  
  -- Drop all policies on profiles
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
  END LOOP;
  
  -- Drop all policies on admin_activity_log
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'admin_activity_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON admin_activity_log', pol.policyname);
  END LOOP;
END $$;

-- Drop policies on other tables if they exist (wallets was removed in migration 007)
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Drop all policies on wallets if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets') THEN
    FOR pol IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = 'wallets'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON wallets', pol.policyname);
    END LOOP;
  END IF;
  
  -- Drop all policies on transactions if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    FOR pol IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = 'transactions'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON transactions', pol.policyname);
    END LOOP;
  END IF;
  
  -- Drop all policies on stripe_accounts if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_accounts') THEN
    FOR pol IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = 'stripe_accounts'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON stripe_accounts', pol.policyname);
    END LOOP;
  END IF;
END $$;

-- Step 3: Alter the column to text temporarily
ALTER TABLE profiles ALTER COLUMN role TYPE TEXT;

-- Step 3: Drop the old enum type
DROP TYPE IF EXISTS user_role CASCADE;

-- Step 4: Create the new enum with only the correct values
CREATE TYPE user_role AS ENUM ('contributor', 'requester', 'admin');

-- Step 5: Convert the column back to use the new enum
ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::user_role;

-- Step 6: Set the default back to 'contributor'
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'contributor'::user_role;

-- Step 7: Update the handle_new_user function to properly handle role assignment
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  desired_role TEXT;
  final_role user_role;
BEGIN
  -- Extract requested role from metadata if present
  desired_role := NEW.raw_user_meta_data->>'role';

  -- Only assign if it's one of the accepted values; otherwise fallback to 'contributor'
  IF desired_role IN ('contributor', 'requester', 'admin') THEN
    final_role := desired_role::user_role;
  ELSE
    final_role := 'contributor'::user_role;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url, role, mail)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    final_role,
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 9: Recreate the policies that were dropped
CREATE POLICY "Admins can view all dataset requests"
    ON dataset_requests FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update dataset requests"
    ON dataset_requests FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can view all submissions"
    ON submissions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update submissions"
    ON submissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can view activity log"
    ON admin_activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can insert activity log"
    ON admin_activity_log FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Approved dataset requests are viewable by everyone"
    ON dataset_requests FOR SELECT
    USING (
        approval_status = 'approved'
        OR 
        auth.uid() = created_by
        OR
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Recreate profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Recreate dataset_requests policies
CREATE POLICY "Authenticated users can create dataset requests"
    ON dataset_requests FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own dataset requests"
    ON dataset_requests FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own dataset requests"
    ON dataset_requests FOR DELETE
    USING (auth.uid() = created_by);

-- Recreate submissions policies
CREATE POLICY "Users can view own submissions"
    ON submissions FOR SELECT
    USING (auth.uid() = contributor_id OR auth.uid() IN (
        SELECT created_by FROM dataset_requests WHERE id = dataset_request_id
    ));

CREATE POLICY "Contributors can create submissions"
    ON submissions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "Contributors can update own submissions"
    ON submissions FOR UPDATE
    USING (auth.uid() = contributor_id);

CREATE POLICY "Dataset owners can update submission status"
    ON submissions FOR UPDATE
    USING (auth.uid() IN (
        SELECT created_by FROM dataset_requests WHERE id = dataset_request_id
    ));

-- Only recreate policies if tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets') THEN
    EXECUTE 'CREATE POLICY "Admins can view all wallets" ON wallets
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE id = auth.uid() AND role = ''admin''
            )
        )';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    EXECUTE 'CREATE POLICY "Admins can view all transactions" ON transactions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE id = auth.uid() AND role = ''admin''
            )
        )';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_accounts') THEN
    EXECUTE 'CREATE POLICY "Admins can view all stripe accounts" ON stripe_accounts
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE id = auth.uid() AND role = ''admin''
            )
        )';
  END IF;
END $$;

