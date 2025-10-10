-- Waitlist signups table to capture landing page submissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
        CREATE TYPE waitlist_status AS ENUM ('pending', 'contacted', 'qualified', 'converted');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT,
    email TEXT NOT NULL,
    company TEXT,
    use_case TEXT,
    status waitlist_status NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure email uniqueness to avoid duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_signups_email_key'
  ) THEN
    ALTER TABLE public.waitlist_signups ADD CONSTRAINT waitlist_signups_email_key UNIQUE (email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_email
    ON public.waitlist_signups (email);

-- Automatically maintain updated_at column
DROP TRIGGER IF EXISTS update_waitlist_signups_updated_at ON public.waitlist_signups;
CREATE TRIGGER update_waitlist_signups_updated_at
    BEFORE UPDATE ON public.waitlist_signups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Harden access with RLS (service key bypasses policies by default)
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.waitlist_signups;
CREATE POLICY "Service role full access" ON public.waitlist_signups
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
