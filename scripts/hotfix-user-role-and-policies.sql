-- One-time hotfix to restore user_role enum, signup trigger, and RLS policies
-- Paste this into Supabase SQL Editor on your project and run once if signup fails with
-- ERROR: type "user_role" does not exist

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure enum exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('contributor', 'requester', 'admin');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'contributor'
    ) THEN ALTER TYPE user_role ADD VALUE 'contributor'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'requester'
    ) THEN ALTER TYPE user_role ADD VALUE 'requester'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
    ) THEN ALTER TYPE user_role ADD VALUE 'admin'; END IF;
  END IF;
END $$;

-- Normalize and enforce profiles.role
DO $$
DECLARE v_udt text; BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role'
  ) THEN
    SELECT udt_name INTO v_udt FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='role';
    UPDATE profiles SET role = 'contributor' WHERE role::text = 'both';
    IF v_udt IS DISTINCT FROM 'user_role' THEN
      ALTER TABLE profiles ALTER COLUMN role TYPE text;
      ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::user_role;
    END IF;
    ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'contributor'::user_role;
  END IF;
END $$;

-- Clean up legacy wallet artifacts that may break profile inserts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_created_wallet') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_profile_created_wallet ON public.profiles';
  END IF;
  DROP FUNCTION IF EXISTS public.create_user_wallet();
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wallets') THEN
    DROP TABLE public.wallets CASCADE;
  END IF;
END $$;

-- Ensure mail column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='mail'
  ) THEN
    ALTER TABLE profiles ADD COLUMN mail TEXT;
  END IF;
END $$;

-- Ensure approval_status type and dataset_requests approval columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dataset_requests') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='dataset_requests' AND column_name='approval_status'
    ) THEN
      ALTER TABLE public.dataset_requests ADD COLUMN approval_status approval_status DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='dataset_requests' AND column_name='admin_notes'
    ) THEN
      ALTER TABLE public.dataset_requests ADD COLUMN admin_notes TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='dataset_requests' AND column_name='approved_by'
    ) THEN
      ALTER TABLE public.dataset_requests ADD COLUMN approved_by UUID REFERENCES public.profiles(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='dataset_requests' AND column_name='approved_at'
    ) THEN
      ALTER TABLE public.dataset_requests ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;

-- Recreate signup function and trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE desired_role TEXT; final_role user_role; BEGIN
  desired_role := NEW.raw_user_meta_data->>'role';
  IF desired_role IN ('contributor','requester','admin') THEN
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
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Approved dataset requests are viewable by everyone" ON public.dataset_requests;
CREATE POLICY "Approved dataset requests are viewable by everyone" ON public.dataset_requests FOR SELECT
USING (approval_status = 'approved' OR auth.uid() = created_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Authenticated users can create dataset requests" ON public.dataset_requests;
CREATE POLICY "Authenticated users can create dataset requests" ON public.dataset_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update own dataset requests" ON public.dataset_requests;
CREATE POLICY "Users can update own dataset requests" ON public.dataset_requests FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete own dataset requests" ON public.dataset_requests;
CREATE POLICY "Users can delete own dataset requests" ON public.dataset_requests FOR DELETE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins can update dataset requests" ON public.dataset_requests;
CREATE POLICY "Admins can update dataset requests" ON public.dataset_requests FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Users can view own submissions" ON public.submissions;
CREATE POLICY "Users can view own submissions" ON public.submissions FOR SELECT
USING (auth.uid() = contributor_id OR auth.uid() IN (SELECT created_by FROM public.dataset_requests WHERE id = dataset_request_id) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Contributors can create submissions" ON public.submissions;
CREATE POLICY "Contributors can create submissions" ON public.submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Contributors can update own submissions" ON public.submissions;
CREATE POLICY "Contributors can update own submissions" ON public.submissions FOR UPDATE USING (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Dataset owners can update submission status" ON public.submissions;
CREATE POLICY "Dataset owners can update submission status" ON public.submissions FOR UPDATE USING (auth.uid() IN (SELECT created_by FROM public.dataset_requests WHERE id = dataset_request_id));

-- Optional admin activity log policies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_activity_log') THEN
    DROP POLICY IF EXISTS "Admins can view activity log" ON public.admin_activity_log;
    CREATE POLICY "Admins can view activity log" ON public.admin_activity_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    DROP POLICY IF EXISTS "Admins can insert activity log" ON public.admin_activity_log;
    CREATE POLICY "Admins can insert activity log" ON public.admin_activity_log FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- Done
