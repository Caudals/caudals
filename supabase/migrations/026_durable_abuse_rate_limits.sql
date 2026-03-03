-- Durable distributed abuse-rate-limiter storage and consume RPC.

CREATE TABLE IF NOT EXISTS public.abuse_rate_limits (
    key text PRIMARY KEY,
    count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
    reset_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_rate_limits_reset_at
    ON public.abuse_rate_limits(reset_at);

ALTER TABLE public.abuse_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abuse_rate_limits_service_select" ON public.abuse_rate_limits;
CREATE POLICY "abuse_rate_limits_service_select" ON public.abuse_rate_limits
    FOR SELECT
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "abuse_rate_limits_service_insert" ON public.abuse_rate_limits;
CREATE POLICY "abuse_rate_limits_service_insert" ON public.abuse_rate_limits
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "abuse_rate_limits_service_update" ON public.abuse_rate_limits;
CREATE POLICY "abuse_rate_limits_service_update" ON public.abuse_rate_limits
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "abuse_rate_limits_service_delete" ON public.abuse_rate_limits;
CREATE POLICY "abuse_rate_limits_service_delete" ON public.abuse_rate_limits
    FOR DELETE
    USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.consume_abuse_rate_limit(
    p_key text,
    p_limit integer,
    p_window_seconds integer
)
RETURNS TABLE (
    allowed boolean,
    limit_count integer,
    remaining integer,
    retry_after_seconds integer,
    reset_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    now_ts timestamptz := now();
    row_record public.abuse_rate_limits%ROWTYPE;
    next_count integer;
BEGIN
    IF p_key IS NULL OR char_length(trim(p_key)) = 0 THEN
        RAISE EXCEPTION 'p_key is required' USING ERRCODE = '22023';
    END IF;

    IF p_limit IS NULL OR p_limit < 1 THEN
        RAISE EXCEPTION 'p_limit must be >= 1' USING ERRCODE = '22023';
    END IF;

    IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN
        RAISE EXCEPTION 'p_window_seconds must be >= 1' USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO row_record
    FROM public.abuse_rate_limits
    WHERE key = p_key
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.abuse_rate_limits (key, count, reset_at, updated_at)
        VALUES (p_key, 1, now_ts + make_interval(secs => p_window_seconds), now_ts)
        RETURNING * INTO row_record;
        next_count := 1;
    ELSIF row_record.reset_at <= now_ts THEN
        UPDATE public.abuse_rate_limits
           SET count = 1,
               reset_at = now_ts + make_interval(secs => p_window_seconds),
               updated_at = now_ts
         WHERE key = p_key
         RETURNING * INTO row_record;
        next_count := 1;
    ELSE
        next_count := row_record.count + 1;
        UPDATE public.abuse_rate_limits
           SET count = next_count,
               updated_at = now_ts
         WHERE key = p_key
         RETURNING * INTO row_record;
    END IF;

    RETURN QUERY
    SELECT
        (next_count <= p_limit) AS allowed,
        p_limit AS limit_count,
        GREATEST(0, p_limit - next_count) AS remaining,
        CASE
          WHEN next_count <= p_limit THEN 0
          ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (row_record.reset_at - now_ts)))::integer)
        END AS retry_after_seconds,
        row_record.reset_at AS reset_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_abuse_rate_limits(
    p_older_than_seconds integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cutoff_ts timestamptz := now() - make_interval(secs => GREATEST(0, COALESCE(p_older_than_seconds, 0)));
    deleted_count integer;
BEGIN
    DELETE FROM public.abuse_rate_limits
    WHERE reset_at <= cutoff_ts;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_abuse_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_abuse_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_abuse_rate_limits(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_abuse_rate_limits(integer) TO service_role;
