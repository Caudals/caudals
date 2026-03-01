-- Per-user notification read state for in-app notification center.

CREATE TABLE IF NOT EXISTS public.user_notification_state (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_user_notification_state_updated_at ON public.user_notification_state;
CREATE TRIGGER update_user_notification_state_updated_at
    BEFORE UPDATE ON public.user_notification_state
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_notification_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification state" ON public.user_notification_state;
CREATE POLICY "Users read own notification state"
    ON public.user_notification_state FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own notification state" ON public.user_notification_state;
CREATE POLICY "Users insert own notification state"
    ON public.user_notification_state FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notification state" ON public.user_notification_state;
CREATE POLICY "Users update own notification state"
    ON public.user_notification_state FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
