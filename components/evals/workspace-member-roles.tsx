"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, EmptyState, Field, RowTitle, SelectField, Status, TableSkeleton, formatDate } from "./primitives";
import { Modal } from "./overlays";
import { usePlatformAction } from "./platform-action";
import { t } from "@/lib/evals/messages/runtime";

type Role = "owner" | "editor" | "viewer" | "operator";
/** One person in the workspace, as `GET /workspaces/:id/members` returns them (launch U1). */
type Member = { user_id: string; email: string; role: Role; name?: string | null; joined_at?: string | null; partner_managed?: boolean; is_self?: boolean };

/**
 * The people in a workspace and their roles (Settings → Members and the ops
 * client panel, launch U1). Owners and operators of the workspace see it, as
 * they see its invitations; platform administrators also change a role here,
 * with a reason, through the audited PATCH.
 */
export function WorkspaceMembers({ orgId, canEditRoles = false }: { orgId: string; canEditRoles?: boolean }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const { run, pending, messages, clearError } = usePlatformAction();
  const load = useCallback(async () => {
    try {
      setMembers(await evalRequest<Member[]>(`/workspaces/${encodeURIComponent(orgId)}/members`));
      setError("");
    } catch (value) { setError(value instanceof Error ? value.message : t("error")); }
  }, [orgId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const headers = [t("membersPerson"), t("role"), { label: t("joined"), align: canEditRoles ? undefined : ("end" as const) }, ...(canEditRoles ? [{ label: t("actions"), align: "end" as const, hidden: true }] : [])];
  return (
    <>
      {error && <Status error action={<Action variant="secondary" size="sm" onClick={() => void load()}>{t("retry")}</Action>}>{error}</Status>}
      {!editing && messages}
      {members === null ? (
        !error && <TableSkeleton columns={3} />
      ) : members.length ? (
        <DataTable caption={t("membersList")} headers={headers} stack>
          {members.map((member) => {
            const name = member.name?.trim();
            const meta = [name ? member.email : null, member.partner_managed ? t("membersPartnerAccess") : null].filter(Boolean).join(" · ");
            return (
              <tr key={member.user_id}>
                <RowTitle meta={meta || undefined}>
                  <span className="p-row">
                    <span>{name || member.email}</span>
                    {member.is_self && <Badge>{t("membersYou")}</Badge>}
                  </span>
                </RowTitle>
                <td><Badge>{t(member.role)}</Badge></td>
                <td className={canEditRoles ? "p-cell-meta" : "p-table-action p-cell-meta"} data-label={t("joined")}>
                  {member.joined_at ? <time dateTime={member.joined_at}>{formatDate(member.joined_at)}</time> : "—"}
                </td>
                {canEditRoles && (
                  <td className="p-table-action" data-cell="menu" data-actions="wide">
                    <Action variant="secondary" size="sm" onClick={() => { clearError(); setEditing(member); }}>{t("editRole")}</Action>
                  </td>
                )}
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState compact title={t("noWorkspaceMembers")} icon={<Users />} />
      )}
      {canEditRoles && members?.length ? <p className="p-field-hint">{t("workspaceRolesHelp")}</p> : null}
      {editing && <Modal open onOpenChange={(value) => !value && !pending && setEditing(null)} title={t("editRole")} description={editing.email} alert={messages}
        footer={<>
          <Action variant="secondary" disabled={pending} onClick={() => setEditing(null)}>{t("cancel")}</Action>
          <Action type="submit" form="member-role-form" disabled={pending}>{pending ? t("saving") : t("save")}</Action>
        </>}
      >
        <form id="member-role-form" className="p-stack" onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const form = new FormData(event.currentTarget);
          const member = editing;
          void run(() => evalRequest(`/workspaces/${encodeURIComponent(orgId)}/members/${encodeURIComponent(member.user_id)}`, "PATCH", {
            role: form.get("role"), previousRole: member.role, reason: form.get("reason"),
          }), t("roleSaved")).then(async (ok) => {
            if (ok) { setEditing(null); await load(); router.refresh(); }
          });
        }}>
          <SelectField id="member-role" name="role" label={t("role")} defaultValue={editing.role} disabled={pending}>
            {(["viewer", "editor", "owner", "operator"] as const).map((role) => <option key={role} value={role}>{t(role)}</option>)}
          </SelectField>
          <Field id="member-role-reason" name="reason" label={t("amendmentReason")} required minLength={3} maxLength={2000} disabled={pending} />
        </form>
      </Modal>}
    </>
  );
}
