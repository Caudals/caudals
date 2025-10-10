-- Ensure the user_role enum exists and is correct, and harden profile creation

-- 1) Create user_role enum if missing (with all expected values)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('contributor', 'requester', 'both', 'admin');
  ELSE
    -- Ensure required labels exist; add if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'contributor'
    ) THEN
      ALTER TYPE user_role ADD VALUE 'contributor';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'requester'
    ) THEN
      ALTER TYPE user_role ADD VALUE 'requester';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'both'
    ) THEN
      ALTER TYPE user_role ADD VALUE 'both';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
    ) THEN
      ALTER TYPE user_role ADD VALUE 'admin';
    END IF;
  END IF;
END $$;

-- 2) Ensure profiles.role default is contributor (not 'both')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'contributor';
  END IF;
END $$;

-- 3) Harden handle_new_user to avoid enum cast errors
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  desired_role TEXT;
  final_role user_role;
BEGIN
  -- Extract requested role from metadata if present
  desired_role := NEW.raw_user_meta_data->>'role';

  -- Only assign if it's one of the accepted values; otherwise fallback to 'contributor'
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

-- 4) Ensure the auth trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 5) Backfill any legacy 'both' roles to 'contributor'
-- Note: Skipping this as migration 011 will handle the enum properly
-- UPDATE profiles SET role = 'contributor' WHERE role = 'both';

