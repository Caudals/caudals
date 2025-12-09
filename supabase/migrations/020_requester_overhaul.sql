-- Extend dataset_status enum with requester-specific values
ALTER TYPE dataset_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE dataset_status ADD VALUE IF NOT EXISTS 'archived';

-- Extend submission_status enum for review workflows
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'needs_changes';

-- Extend profiles for locale + notification configuration
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;

-- Extend dataset_requests with automation + collaboration metadata
ALTER TABLE public.dataset_requests
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS automation_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS share_token text;

-- Extend submissions for richer QA tracking
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Dataset templates catalog
CREATE TABLE IF NOT EXISTS public.dataset_templates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    title text NOT NULL,
    prompt text,
    category dataset_category,
    data_type data_type,
    default_requirements text[] DEFAULT '{}',
    default_reward_amount numeric(10,2),
    default_samples_needed integer,
    default_quality_criteria text[] DEFAULT '{}',
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_dataset_templates_updated_at
    BEFORE UPDATE ON public.dataset_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dataset_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dataset templates readable by authenticated" ON public.dataset_templates
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
CREATE POLICY "Users manage their templates" ON public.dataset_templates
    FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users update their templates" ON public.dataset_templates
    FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Dataset activity log table (requester-focused)
CREATE TABLE IF NOT EXISTS public.dataset_activity (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_request_id uuid NOT NULL REFERENCES public.dataset_requests(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role text,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dataset_activity_dataset ON public.dataset_activity(dataset_request_id);
CREATE INDEX IF NOT EXISTS idx_dataset_activity_actor ON public.dataset_activity(actor_id);

ALTER TABLE public.dataset_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dataset owners can view activity" ON public.dataset_activity
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.dataset_requests dr
            WHERE dr.id = dataset_request_id AND dr.created_by = auth.uid()
        ) OR actor_id = auth.uid()
    );
CREATE POLICY "Dataset owners can insert activity" ON public.dataset_activity
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.dataset_requests dr
            WHERE dr.id = dataset_request_id AND dr.created_by = auth.uid()
        ) OR actor_id = auth.uid()
    );

-- Dataset export jobs
CREATE TABLE IF NOT EXISTS public.dataset_exports (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_request_id uuid NOT NULL REFERENCES public.dataset_requests(id) ON DELETE CASCADE,
    requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','failed','cancelled','expired')),
    export_type text NOT NULL DEFAULT 'full',
    metadata jsonb DEFAULT '{}'::jsonb,
    file_url text,
    checksum text,
    size_bytes bigint,
    progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error text,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dataset_exports_dataset ON public.dataset_exports(dataset_request_id);
CREATE INDEX IF NOT EXISTS idx_dataset_exports_status ON public.dataset_exports(status);

CREATE TRIGGER update_dataset_exports_updated_at
    BEFORE UPDATE ON public.dataset_exports
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dataset_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dataset owners view exports" ON public.dataset_exports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.dataset_requests dr
            WHERE dr.id = dataset_request_id AND dr.created_by = auth.uid()
        ) OR requested_by = auth.uid()
    );
CREATE POLICY "Dataset owners manage exports" ON public.dataset_exports
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.dataset_requests dr
            WHERE dr.id = dataset_request_id AND dr.created_by = auth.uid()
        ) OR requested_by = auth.uid()
    );
CREATE POLICY "Dataset owners update exports" ON public.dataset_exports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.dataset_requests dr
            WHERE dr.id = dataset_request_id AND dr.created_by = auth.uid()
        ) OR requested_by = auth.uid()
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.dataset_requests dr
            WHERE dr.id = dataset_request_id AND dr.created_by = auth.uid()
        ) OR requested_by = auth.uid()
    );

-- Requester onboarding progress
CREATE TABLE IF NOT EXISTS public.requester_onboarding_progress (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    steps jsonb DEFAULT '{}'::jsonb,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_requester_onboarding_updated_at
    BEFORE UPDATE ON public.requester_onboarding_progress
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.requester_onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read onboarding progress" ON public.requester_onboarding_progress
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage onboarding progress" ON public.requester_onboarding_progress
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update onboarding progress" ON public.requester_onboarding_progress
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Organization settings
CREATE TABLE IF NOT EXISTS public.requester_org_settings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_name text,
    contact_email text,
    tax_id text,
    billing_address jsonb,
    default_currency text DEFAULT 'usd',
    po_required boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

CREATE TRIGGER update_requester_org_settings_updated_at
    BEFORE UPDATE ON public.requester_org_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.requester_org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read org settings" ON public.requester_org_settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage org settings" ON public.requester_org_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update org settings" ON public.requester_org_settings
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- API keys for programmatic exports
CREATE TABLE IF NOT EXISTS public.requester_api_keys (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    key_hash text NOT NULL,
    name text,
    scopes text[] DEFAULT '{}',
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_requester_api_keys_user ON public.requester_api_keys(user_id);

ALTER TABLE public.requester_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their api keys" ON public.requester_api_keys
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage api keys" ON public.requester_api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update api keys" ON public.requester_api_keys
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete api keys" ON public.requester_api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    subject text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    messages jsonb DEFAULT '[]'::jsonb,
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

CREATE TRIGGER update_support_tickets_updated_at
    BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their tickets" ON public.support_tickets
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create tickets" ON public.support_tickets
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tickets" ON public.support_tickets
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

