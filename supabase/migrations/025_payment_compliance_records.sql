-- Payment compliance metadata registry
-- Stores optional tax/legal references separately from the core transaction ledger.

CREATE TABLE IF NOT EXISTS public.payment_compliance_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
    legal_entity_name text,
    legal_entity_country text,
    tax_reference text,
    vat_reference text,
    invoice_reference text,
    purchase_order_reference text,
    payout_statement_reference text,
    legal_hold boolean NOT NULL DEFAULT false,
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_compliance_legal_entity_country_format
      CHECK (
        legal_entity_country IS NULL
        OR char_length(legal_entity_country) = 2
      )
);

CREATE INDEX IF NOT EXISTS idx_payment_compliance_transaction_id
    ON public.payment_compliance_records(transaction_id);

CREATE INDEX IF NOT EXISTS idx_payment_compliance_legal_hold
    ON public.payment_compliance_records(legal_hold)
    WHERE legal_hold = true;

CREATE INDEX IF NOT EXISTS idx_payment_compliance_updated_at
    ON public.payment_compliance_records(updated_at DESC);

DROP TRIGGER IF EXISTS trg_payment_compliance_updated_at ON public.payment_compliance_records;
CREATE TRIGGER trg_payment_compliance_updated_at
BEFORE UPDATE ON public.payment_compliance_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payment_compliance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_compliance_admin_read" ON public.payment_compliance_records;
CREATE POLICY "payment_compliance_admin_read" ON public.payment_compliance_records
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    );

DROP POLICY IF EXISTS "payment_compliance_admin_insert" ON public.payment_compliance_records;
CREATE POLICY "payment_compliance_admin_insert" ON public.payment_compliance_records
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    );

DROP POLICY IF EXISTS "payment_compliance_admin_update" ON public.payment_compliance_records;
CREATE POLICY "payment_compliance_admin_update" ON public.payment_compliance_records
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    );

DROP POLICY IF EXISTS "payment_compliance_service_select" ON public.payment_compliance_records;
CREATE POLICY "payment_compliance_service_select" ON public.payment_compliance_records
    FOR SELECT
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "payment_compliance_service_insert" ON public.payment_compliance_records;
CREATE POLICY "payment_compliance_service_insert" ON public.payment_compliance_records
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "payment_compliance_service_update" ON public.payment_compliance_records;
CREATE POLICY "payment_compliance_service_update" ON public.payment_compliance_records
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.verify_payment_compliance_policy_surface()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    policy_names text[];
BEGIN
    SELECT array_agg(policyname ORDER BY policyname)
      INTO policy_names
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_compliance_records';

    RETURN jsonb_build_object(
      'table_exists',
      to_regclass('public.payment_compliance_records') IS NOT NULL,
      'policy_names',
      COALESCE(policy_names, ARRAY[]::text[])
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_payment_compliance_policy_surface() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_payment_compliance_policy_surface() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payment_compliance_policy_surface() TO service_role;
