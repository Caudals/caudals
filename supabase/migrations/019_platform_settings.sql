-- Platform settings key-value store (admin-only)

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES public.profiles(id)
);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.platform_settings_touch()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_settings_touch ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_touch
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.platform_settings_touch();

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings_admin_read" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_read"
    ON public.platform_settings
    FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "platform_settings_admin_write" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_write"
    ON public.platform_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "platform_settings_admin_update" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_update"
    ON public.platform_settings
    FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
