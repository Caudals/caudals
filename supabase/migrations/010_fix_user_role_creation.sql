-- Fix user role enum to include admin and update trigger
-- First, add 'admin' to the enum if it doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') AND NOT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'admin';
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
  END IF;
END$$;

-- Update the handle_new_user function to properly set role and email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  desired_role TEXT;
  final_role user_role;
BEGIN
    desired_role := NEW.raw_user_meta_data->>'role';
    IF desired_role IN ('contributor','requester','admin') THEN
      final_role := desired_role::user_role;
    ELSE
      final_role := 'contributor';
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

-- Also update profiles default role to be 'contributor' instead of 'both'
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'contributor';

-- Update existing profiles that might have 'both' role to 'contributor'
UPDATE profiles SET role = 'contributor' WHERE role = 'both';
