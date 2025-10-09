-- SQL script to apply user role fixes
-- This script fixes the user role creation process

-- Add 'admin' to the enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'admin';
    RAISE NOTICE 'Added admin role to user_role enum';
  ELSE
    RAISE NOTICE 'Admin role already exists in user_role enum';
  END IF;
END$$;

-- Add mail column to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'mail'
  ) THEN
    ALTER TABLE profiles ADD COLUMN mail TEXT;
    RAISE NOTICE 'Added mail column to profiles table';
  ELSE
    RAISE NOTICE 'Mail column already exists in profiles table';
  END IF;
END$$;

-- Update the handle_new_user function to properly set role and email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Extract role from user metadata, default to 'contributor' if not provided
    INSERT INTO public.profiles (id, full_name, avatar_url, role, mail)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        COALESCE(
            (NEW.raw_user_meta_data->>'role')::user_role,
            'contributor'
        ),
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update profiles default role to be 'contributor' instead of 'both'
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'contributor';

-- Update existing profiles that might have 'both' role to 'contributor'
UPDATE profiles SET role = 'contributor' WHERE role = 'both';

RAISE NOTICE 'User role fix applied successfully';
