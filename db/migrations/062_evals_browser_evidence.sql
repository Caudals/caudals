-- Website connector evidence (spec §8.3, WP-09): short-lived, redacted
-- screenshots of discovery failures, and operator-assisted login sessions.
--
-- The browser executor has no object-store access by design, so its small
-- viewport screenshots (inputs masked, no full-page capture) are kept as
-- bounded rows that expire after seven days and are purged by the lifecycle
-- worker. Operators view them through an authenticated, workspace-scoped route.
BEGIN;

CREATE TABLE evals.browser_capture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  target_revision_id uuid NOT NULL,
  candidate_id uuid,
  reason_code text NOT NULL,
  media_type text NOT NULL CHECK (media_type='image/jpeg'),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 400000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  redaction text NOT NULL DEFAULT 'viewport_only_inputs_masked',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days' CHECK (expires_at <= created_at+interval '7 days'),
  UNIQUE (org_id,id),
  FOREIGN KEY (org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id)
);
CREATE INDEX browser_capture_expiry ON evals.browser_capture(expires_at);
CREATE INDEX browser_capture_target ON evals.browser_capture(org_id,target_revision_id,created_at DESC);
ALTER TABLE evals.browser_capture ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.browser_capture FORCE ROW LEVEL SECURITY;
CREATE POLICY browser_capture_tenant ON evals.browser_capture
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.browser_capture FROM PUBLIC;
GRANT INSERT ON evals.browser_capture TO evals_browser;
GRANT SELECT ON evals.browser_capture TO evals_runtime;

-- Expired captures are removed outright (they are not recovery evidence).
CREATE FUNCTION evals.purge_expired_browser_captures()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM evals.browser_capture WHERE expires_at<=now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION evals.purge_expired_browser_captures() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.purge_expired_browser_captures() TO evals_runtime;

COMMIT;
