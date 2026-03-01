-- Contributor-specific persisted settings for role-clean contributor UX.

CREATE TABLE IF NOT EXISTS public.contributor_settings (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    portfolio_url text,
    timezone text,
    availability text NOT NULL DEFAULT 'open' CHECK (availability IN ('open', 'limited', 'unavailable')),
    focus_areas text[] NOT NULL DEFAULT '{}',
    notification_prefs jsonb NOT NULL DEFAULT '{"review_updates": true, "payout_updates": true, "recommendations": true}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contributor_settings_availability
    ON public.contributor_settings(availability);

DROP TRIGGER IF EXISTS update_contributor_settings_updated_at ON public.contributor_settings;
CREATE TRIGGER update_contributor_settings_updated_at
    BEFORE UPDATE ON public.contributor_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contributor_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contributors read own settings" ON public.contributor_settings;
CREATE POLICY "Contributors read own settings"
    ON public.contributor_settings FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Contributors upsert own settings" ON public.contributor_settings;
CREATE POLICY "Contributors upsert own settings"
    ON public.contributor_settings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Contributors update own settings" ON public.contributor_settings;
CREATE POLICY "Contributors update own settings"
    ON public.contributor_settings FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read contributor settings" ON public.contributor_settings;
CREATE POLICY "Admins can read contributor settings"
    ON public.contributor_settings FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
      )
    );
