-- Write-only customer target credentials (spec §5.2, §5.5, §8.2, §13.3).
--
-- The web runtime encrypts a credential with the envelope keyring and stores
-- it through these narrow functions. It still has no SELECT on envelopes, so
-- the web process cannot read a stored secret back; only the fenced target
-- invocation path in the worker decrypts. Rotation appends a new immutable
-- version; revocation is permanent for the record.
BEGIN;

ALTER TABLE evals.secret_record
  ADD COLUMN label text CHECK (label IS NULL OR length(label) BETWEEN 1 AND 120),
  ADD COLUMN credential_kind text CHECK (credential_kind IS NULL OR credential_kind IN ('bearer','header_token')),
  ADD COLUMN header_name text CHECK (header_name IS NULL OR header_name ~ '^[A-Za-z][A-Za-z0-9-]{0,63}$'),
  ADD COLUMN expires_at timestamptz;

CREATE FUNCTION evals.can_manage_target_credentials(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT p_org_id IS NOT DISTINCT FROM evals.org_id() AND evals.actor_id() IS NOT NULL AND (
    evals.is_admin() OR EXISTS (
      SELECT 1 FROM evals.membership m
      WHERE m.org_id=p_org_id AND m.user_id=evals.actor_id() AND m.role IN ('owner','editor','operator')))
$$;

CREATE FUNCTION evals.write_target_credential(
  p_org_id uuid, p_target_id uuid, p_record_id uuid, p_version_id uuid, p_envelope jsonb,
  p_label text, p_kind text, p_header_name text, p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE existing evals.secret_record; rotated boolean;
BEGIN
  IF NOT evals.can_manage_target_credentials(p_org_id) THEN
    RAISE EXCEPTION 'target credential scope denied' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.target t WHERE t.org_id=p_org_id AND t.id=p_target_id) THEN
    RAISE EXCEPTION 'target credential scope denied' USING ERRCODE='42501';
  END IF;
  IF p_envelope IS NULL OR jsonb_typeof(p_envelope)<>'object' OR p_envelope->>'algorithm' IS DISTINCT FROM 'aes-256-gcm' THEN
    RAISE EXCEPTION 'invalid credential envelope' USING ERRCODE='22023';
  END IF;
  SELECT * INTO existing FROM evals.secret_record r WHERE r.org_id=p_org_id AND r.id=p_record_id FOR UPDATE;
  rotated := FOUND;
  IF rotated THEN
    IF existing.purpose<>'target' OR existing.scope_id<>p_target_id OR existing.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'target credential scope denied' USING ERRCODE='42501';
    END IF;
    UPDATE evals.secret_record SET label=coalesce(p_label,label), credential_kind=p_kind,
      header_name=p_header_name, expires_at=p_expires_at WHERE org_id=p_org_id AND id=p_record_id;
  ELSE
    INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by,label,credential_kind,header_name,expires_at)
    VALUES (p_record_id,p_org_id,'target',p_target_id,evals.actor_id(),p_label,p_kind,p_header_name,p_expires_at);
  END IF;
  INSERT INTO evals.secret_version(id,org_id,record_id,envelope,created_by)
  VALUES (p_version_id,p_org_id,p_record_id,p_envelope,evals.actor_id());
  INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id)
  VALUES (p_org_id,evals.actor_id(),CASE WHEN rotated THEN 'target_credential_rotated' ELSE 'target_credential_created' END,p_record_id::text);
  RETURN p_version_id;
END $$;

CREATE FUNCTION evals.revoke_target_credential(p_org_id uuid, p_record_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
BEGIN
  IF NOT evals.can_manage_target_credentials(p_org_id) THEN
    RAISE EXCEPTION 'target credential scope denied' USING ERRCODE='42501';
  END IF;
  UPDATE evals.secret_record SET revoked_at=now()
  WHERE org_id=p_org_id AND id=p_record_id AND purpose='target' AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO evals.recovery_control_event(org_id,action,subject_type,subject_id,actor_id,payload_hash)
  VALUES (p_org_id,'credential_revoked','secret_record',p_record_id,evals.actor_id(),
    encode(sha256(convert_to('credential_revoked:'||p_record_id::text,'UTF8')),'hex'))
  ON CONFLICT DO NOTHING;
  INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id)
  VALUES (p_org_id,evals.actor_id(),'target_credential_revoked',p_record_id::text);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION evals.can_manage_target_credentials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.write_target_credential(uuid,uuid,uuid,uuid,jsonb,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.revoke_target_credential(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.write_target_credential(uuid,uuid,uuid,uuid,jsonb,text,text,text,timestamptz) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.revoke_target_credential(uuid,uuid) TO evals_runtime;

-- Metadata only: label, kind, rotation history and state. Never envelopes.
GRANT SELECT(label,credential_kind,header_name,expires_at,created_by,created_at) ON evals.secret_record TO evals_runtime;
GRANT SELECT(created_by,created_at) ON evals.secret_version TO evals_runtime;

COMMIT;
