"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, Field, Loading, RowTitle, Status } from "./primitives";
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

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

/**
 * Write-only credential management for one API system (spec §5.5). Values are
 * never displayed or returned; rotation stores a new version and a new system
 * revision so earlier runs keep the exact configuration they used.
 */
export function TargetCredentials({ orgId, targetId, canRevoke, onChanged }: {
  orgId: string;
  targetId: string;
  canRevoke: boolean;
  onChanged?: () => void;
}) {
  const [list, setList] = useState<CredentialList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  useEffect(() => { void load(); }, [load]);
  const active = list?.credentials.find((item) => !item.revoked_at);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!value || pending) return;
    setPending(true); setError(""); setNotice("");
    try {
      const stored = await evalRequest<{ targetRevisionId: string }>(`/targets/${targetId}/credentials`, "POST", {
        orgId,
        recordId: active?.id,
        label: label.trim() || "API key",
        kind: headerName.toLowerCase() === "authorization" ? "bearer" : "header_token",
        headerName,
        value,
      }, crypto.randomUUID());
      setValue("");
      await evalRequest(`/targets/${stored.targetRevisionId}/checks`, "POST", { orgId }, crypto.randomUUID());
      setNotice(active ? t("credentialRotated") : t("credentialSaved"));
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
    setPending(true); setError(""); setNotice("");
    try {
      await evalRequest(`/targets/${targetId}/credentials/${recordId}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      setNotice(t("credentialRevoked"));
      await load();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="eval-panel" aria-label={t("credentials")}>
      <h2>{t("credentials")}</h2>
      <p>{t("credentialHelp")}</p>
      {error && <Status error>{error}</Status>}
      {notice && <Status>{notice}</Status>}
      {!list ? <Loading /> : list.credentials.length ? (
        <DataTable caption={t("credentials")} headers={[t("credentialLabel"), t("statusLabel"), t("credentialRotations"), t("lastValidation"), { label: t("access"), align: "end" }]}>
          {list.credentials.map((item) => (
            <tr key={item.id}>
              <RowTitle meta={item.header_name ?? undefined}>{item.label ?? t("credentials")}</RowTitle>
              <td>{item.revoked_at ? <Badge tone="fail">{t("credentialStateRevoked")}</Badge> : <Badge tone="pass" dot>{t("credentialStateActive")}</Badge>}</td>
              <td>{item.versions.length} · {formatDate(item.versions[0]?.created_at ?? item.created_at)}</td>
              <td>{list.lastCheck ? `${list.lastCheck.status} · ${formatDate(list.lastCheck.created_at)}` : "—"}</td>
              <td className="p-table-action">{!item.revoked_at && canRevoke ? <Action variant="secondary" size="sm" onClick={() => void revoke(item.id)} disabled={pending}>{t("credentialRevoke")}</Action> : null}</td>
            </tr>
          ))}
        </DataTable>
      ) : <p className="p-cell-meta">{t("noCredentials")}</p>}
      <form className="eval-flow-card" onSubmit={save} autoComplete="off">
        <Field id={`credential-label-${targetId}`} label={t("credentialLabel")} value={label} onChange={(event) => setLabel(event.target.value)} required />
        <Field id={`credential-header-${targetId}`} label={t("credentialHeader")} value={headerName} onChange={(event) => setHeaderName(event.target.value)} required />
        <Field id={`credential-value-${targetId}`} type="password" label={active ? t("credentialNewValue") : t("credentialValue")} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="new-password" required />
        <Button disabled={!value || pending}>{active ? t("rotateCredential") : t("saveCredential")}</Button>
      </form>
    </section>
  );
}
