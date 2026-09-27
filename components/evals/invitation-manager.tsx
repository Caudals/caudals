"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { evalRequest } from "./api";
import { invitationPath } from "./auth-path";
import { Action, Badge, DataTable, EmptyState, Field, RowTitle, SelectField, Status, Time } from "./primitives";
import { CopyField, Modal, notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";

type Invitation = {
  id: string;
  email?: string;
  token?: string | null;
  role?: string;
  expires_at?: string;
  revoked_at?: string | null;
  accepted_at?: string | null;
};

function invitationState(item: Invitation) {
  if (item.accepted_at) return { label: t("member"), tone: "pass" as const };
  if (item.revoked_at) return { label: t("stateRevoked"), tone: "neutral" as const };
  if (item.expires_at && new Date(item.expires_at).getTime() < Date.now()) return { label: t("stateExpired"), tone: "neutral" as const };
  return { label: t("pendingInvitation"), tone: "info" as const };
}

/**
 * Invite people into one workspace and see who has joined. Invitations are
 * private links shown once; only a digest is stored. Used by workspace owners
 * in Settings and by operators on a client.
 */
export function InvitationManager({ orgId, workspaceName }: { orgId: string; workspaceName: string }) {
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [pending, setPending] = useState("");
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);
  const keys = useRef(new Map<string, string>());
  const keyFor = (input: unknown) => {
    const fingerprint = JSON.stringify(input);
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(fingerprint, key);
    }
    return key;
  };

  const load = useCallback(async () => {
    try {
      setItems(await evalRequest<Invitation[]>(`/workspaces/${encodeURIComponent(orgId)}/invitations`));
      setError("");
    } catch (value) {
      setItems([]);
      setError(value instanceof Error ? value.message : t("error"));
    }
  }, [orgId]);
  useEffect(() => {
    setItems(null);
    setCreated(null);
    void load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    setPending("invite");
    setError("");
    try {
      const invitation = await evalRequest<Invitation>(`/workspaces/${encodeURIComponent(orgId)}/invitations`, "POST", { email: address, role }, keyFor([orgId, address, role]));
      keys.current.delete(JSON.stringify([orgId, address, role]));
      setCreated(invitation.token ? { email: address, link: `${window.location.origin}${invitationPath(invitation.token)}` } : null);
      if (!invitation.token) notify(t("invitationSaved"));
      setEmail("");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending("");
    }
  }

  async function revoke(id: string) {
    setPending(id);
    setError("");
    try {
      await evalRequest(`/invitations/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("revoked"));
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending("");
    }
  }

  return (
    <section aria-label={t("members")}>
      <div className="p-section-head">
        <div className="p-head-text">
          <h2>{t("members")}</h2>
          <p>{t("membersHelp")}</p>
        </div>
        <Action variant="secondary" onClick={() => { setCreated(null); setOpen(true); }}>
          <UserPlus aria-hidden="true" />
          {t("invite")}
        </Action>
      </div>
      {error && <Status error>{error}</Status>}
      {items === null ? (
        <p className="p-cell-meta">{t("loading")}</p>
      ) : items.length ? (
        <DataTable caption={t("members")} headers={[t("email"), t("role"), t("statusLabel"), { label: t("actions"), align: "end", hidden: true }]}>
          {items.map((item) => {
            const state = invitationState(item);
            const revocable = !item.accepted_at && !item.revoked_at && state.label === t("pendingInvitation");
            return (
              <tr key={item.id}>
                <RowTitle meta={item.expires_at && !item.accepted_at && !item.revoked_at ? <>{t("expires")} <Time value={item.expires_at} /></> : undefined}>{item.email}</RowTitle>
                <td>{item.role ? t(item.role as "owner" | "editor" | "viewer") : "—"}</td>
                <td>
                  <Badge tone={state.tone} dot>
                    {state.label}
                  </Badge>
                </td>
                <td className="p-table-action">
                  {revocable && (
                    <Action variant="ghost" size="sm" disabled={!!pending} onClick={() => void revoke(item.id)}>
                      {pending === item.id ? t("revoking") : t("revoke")}
                    </Action>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState title={t("noInvitations")} icon={<UserPlus />}>
          <p>{t("noInvitationsHelp")}</p>
        </EmptyState>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={created ? t("invitationReady") : `${t("inviteTo")} ${workspaceName}`}
        description={created ? `${t("invitationReadyHelp")} ${created.email}.` : t("inviteHelp")}
        footer={
          created ? (
            <Action onClick={() => setOpen(false)}>{t("done")}</Action>
          ) : (
            <>
              <Action variant="secondary" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Action>
              <Action type="submit" form={`invite-${orgId}`} disabled={!!pending || !email.trim()}>
                {pending === "invite" ? t("inviting") : t("createInvitation")}
              </Action>
            </>
          )
        }
      >
        {created ? (
          <CopyField label={t("invitationLink")} value={created.link} hint={t("invitationLinkOnce")} />
        ) : (
          <form id={`invite-${orgId}`} className="p-stack" onSubmit={invite}>
            <Field id={`invite-email-${orgId}`} label={t("email")} type="email" maxLength={254} autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <SelectField id={`invite-role-${orgId}`} label={t("role")} value={role} onChange={(event) => setRole(event.target.value)} hint={t("roleHint")}>
              <option value="viewer">{t("viewer")}</option>
              <option value="editor">{t("editor")}</option>
              <option value="owner">{t("owner")}</option>
            </SelectField>
          </form>
        )}
      </Modal>
    </section>
  );
}
