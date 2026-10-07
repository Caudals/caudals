"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, Field, RowTitle, SectionHeading, SelectField, Status } from "./primitives";
import { Modal } from "./overlays";
import { usePlatformAction } from "./platform-action";
import { t } from "@/lib/evals/messages/en";

type Role = "owner" | "editor" | "viewer" | "operator";
type Member = { user_id: string; email: string; role: Role };

export function WorkspaceMemberRoles({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const { run, pending, messages, clearError } = usePlatformAction();
  const load = useCallback(async () => {
    try {
      setMembers(await evalRequest<Member[]>(`/workspaces/${orgId}/members`));
      setError("");
    } catch (value) { setError(value instanceof Error ? value.message : t("error")); }
  }, [orgId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <section className="p-section" aria-label={t("workspaceRoles")}>
      <SectionHeading title={t("workspaceRoles")}>{t("workspaceRolesHelp")}</SectionHeading>
      {error && <Status error action={<Action variant="secondary" onClick={() => void load()}>{t("retry")}</Action>}>{error}</Status>}
      {!editing && messages}
      {members === null ? <p role="status">{t("loading")}</p> : members.length ? (
        <DataTable caption={t("workspaceRoles")} headers={[t("email"), t("role"), { label: t("actions"), align: "end", hidden: true }]}>
          {members.map((member) => <tr key={member.user_id}>
            <RowTitle>{member.email}</RowTitle>
            <td><Badge>{t(member.role)}</Badge></td>
            <td className="p-table-action"><Action variant="secondary" size="sm" onClick={() => { clearError(); setEditing(member); }}>{t("editRole")}</Action></td>
          </tr>)}
        </DataTable>
      ) : <p className="p-cell-meta">{t("noWorkspaceMembers")}</p>}
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
          void run(() => evalRequest(`/workspaces/${orgId}/members/${encodeURIComponent(member.user_id)}`, "PATCH", {
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
    </section>
  );
}
