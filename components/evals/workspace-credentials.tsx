"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, Field, SectionHeading, Status, Time } from "./primitives";
import { notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";

type CredentialList = {
  targetId: string;
  lastCheck: { created_at: string; status: string } | null;
  credentials: Array<{
    id: string;
    label: string | null;
    credential_kind: "bearer" | "header_token" | null;
    header_name: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
    versions: Array<{ id: string; created_at: string; created_by: string }>;
  }>;
};

/**
 * Write-only credential management for one API system (spec §5.5). Values are
 * never displayed or returned; rotation stores a new version and a new system
 * revision so earlier runs keep the exact configuration they used.
 */
export function TargetCredentials({ orgId, targetId, canRevoke, onChanged }: { orgId: string; targetId: string; canRevoke: boolean; onChanged?: () => void }) {
  const [list, setList] = useState<CredentialList | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState("API key");
  const [headerName, setHeaderName] = useState("Authorization");
  const [value, setValue] = useState("");
  const load = useCallback(async () => {
    try {
      setList(await evalRequest<CredentialList>(`/targets/${targetId}/credentials?orgId=${encodeURIComponent(orgId)}`));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    }
  }, [orgId, targetId]);
  useEffect(() => {
    void load();
  }, [load]);
  const active = list?.credentials.find((item) => !item.revoked_at);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!value || pending) return;
    setPending(true);
    setError("");
    try {
      const stored = await evalRequest<{ targetRevisionId: string }>(
        `/targets/${targetId}/credentials`,
        "POST",
        { orgId, recordId: active?.id, label: label.trim() || "API key", kind: headerName.toLowerCase() === "authorization" ? "bearer" : "header_token", headerName, value },
        crypto.randomUUID(),
      );
      setValue("");
      await evalRequest(`/targets/${stored.targetRevisionId}/checks`, "POST", { orgId }, crypto.randomUUID());
      notify(active ? t("credentialRotated") : t("credentialSaved"));
      await load();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setValue("");
      setPending(false);
    }
  }

  async function revoke(recordId: string) {
    setPending(true);
    setError("");
    try {
      await evalRequest(`/targets/${targetId}/credentials/${recordId}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("credentialRevoked"));
      await load();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label={t("credentials")}>
      <SectionHeading title={t("credentials")}>{t("credentialHelp")}</SectionHeading>
      {error && <Status error>{error}</Status>}
      {!list ? (
        <p className="p-cell-meta">{t("loading")}</p>
      ) : list.credentials.length ? (
        <ul className="p-keys">
          {list.credentials.map((item) => (
            <li key={item.id}>
              <KeyRound aria-hidden="true" />
              <span className="p-keys-main">
                <span className="p-keys-name">{item.label ?? t("credentials")}</span>
                <span className="p-cell-meta">
                  {item.header_name ?? "Authorization"} · {item.versions.length} {item.versions.length === 1 ? t("version") : t("versions")} · {t("updated")} <Time value={item.versions[0]?.created_at ?? item.created_at} />
                  {list.lastCheck && !item.revoked_at ? ` · ${t("lastValidation")}: ${list.lastCheck.status}` : ""}
                </span>
              </span>
              {item.revoked_at ? <Badge>{t("credentialStateRevoked")}</Badge> : <Badge tone="pass" dot>{t("credentialStateActive")}</Badge>}
              {!item.revoked_at && canRevoke && (
                <Action variant="ghost" size="sm" onClick={() => void revoke(item.id)} disabled={pending}>
                  {t("credentialRevoke")}
                </Action>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-cell-meta">{t("noCredentials")}</p>
      )}
      <form className="p-inline-form" onSubmit={save} autoComplete="off">
        <div className="p-grid-2 p-form-grid">
          <Field id={`credential-label-${targetId}`} label={t("credentialLabel")} value={label} onChange={(event) => setLabel(event.target.value)} required />
          <Field id={`credential-header-${targetId}`} label={t("credentialHeader")} value={headerName} onChange={(event) => setHeaderName(event.target.value)} required />
        </div>
        <Field id={`credential-value-${targetId}`} type="password" label={active ? t("credentialNewValue") : t("credentialValue")} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="new-password" required hint={t("credentialWriteOnly")} />
        <div className="p-row">
          <Action type="submit" variant="secondary" disabled={!value || pending}>
            {active ? t("rotateCredential") : t("saveCredential")}
          </Action>
        </div>
      </form>
    </section>
  );
}
