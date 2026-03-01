-- Product analytics events for funnel conversion reporting.

CREATE TABLE IF NOT EXISTS public.product_analytics_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name text NOT NULL,
    event_category text NOT NULL DEFAULT 'funnel',
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_role text,
    session_id text,
    path text,
    source text NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_name
    ON public.product_analytics_events(event_name);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_occurred_at
    ON public.product_analytics_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_user_id
    ON public.product_analytics_events(user_id);
