"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { invitationPath } from "./auth-path";
import { t } from "@/lib/evals/messages/en";
import {
  PageHeading,
  EmptyState,
  Field,
  DataTable,
  Status,
  SessionRecovery,
} from "./primitives";
import { evalRequest, EvalRequestError } from "./api";

type Workspace = { id: string; name: string };
type Invitation = {
  id: string;
  email?: string;
  token?: string | null;
  role?: string;
  expires_at?: string;
  revoked_at?: string | null;
  accepted_at?: string | null;
};
export function ClientManagement() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [invitations, setInvitations] = useState<
    (Invitation & { workspaceId: string })[]
  >([]);
  const requestKeys = useRef(new Map<string, string>());
  function keyFor(input: unknown) {
    const fingerprint = JSON.stringify(input);
    let key = requestKeys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      requestKeys.current.set(fingerprint, key);
    }
    return key;
  }
  const client = workspaces.find((w) => w.id === selected);
  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await evalRequest<Workspace[]>("/workspaces");
      setWorkspaces(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error(t("error")));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending("create");
    setError(null);
    setNotice("");
    try {
      const workspace = await evalRequest<Workspace>(
        "/workspaces",
        "POST",
        { name: name.trim() },
        keyFor(["workspace", name.trim()]),
      );
      requestKeys.current.delete(JSON.stringify(["workspace", name.trim()]));
      setWorkspaces((current) => [
        ...current.filter((w) => w.id !== workspace.id),
        workspace,
      ]);
      setSelected(workspace.id);
      setName("");
      setNotice(t("created"));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(t("error")));
    } finally {
      setPending("");
    }
  }
  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    setPending("invite");
    setError(null);
    setNotice("");
    try {
      const invitation = await evalRequest<Invitation>(
        `/workspaces/${encodeURIComponent(client.id)}/invitations`,
        "POST",
        { email: email.trim(), role },
        keyFor([client.id, email.trim(), role]),
      );
      setInvitations((current) => [
        ...current.filter((i) => i.id !== invitation.id),
        {
          ...invitation,
          email: invitation.email ?? email.trim(),
          workspaceId: client.id,
        },
      ]);
      requestKeys.current.delete(
        JSON.stringify([client.id, email.trim(), role]),
      );
      setEmail("");
      setNotice(t(invitation.token ? "invitationCreated" : "invitationSaved"));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(t("error")));
    } finally {
      setPending("");
    }
  }
  async function selectClient(id: string) {
    setSelected(id);
    setError(null);
    setNotice("");
    setPending("list");
    try {
      const list = await evalRequest<Invitation[]>(
        `/workspaces/${encodeURIComponent(id)}/invitations`,
      );
      setInvitations((current) => [
        ...current.filter((i) => i.workspaceId !== id),
        ...list.map((i) => ({
          ...i,
          token: current.find((old) => old.id === i.id)?.token,
          workspaceId: id,
        })),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(t("error")));
    } finally {
      setPending("");
    }
  }
  async function revoke(id: string) {
    setPending(id);
    setError(null);
    setNotice("");
    try {
      await evalRequest(
        `/invitations/${encodeURIComponent(id)}?orgId=${encodeURIComponent(selected)}`,
        "DELETE",
      );
      setInvitations((current) => current.filter((i) => i.id !== id));
      setNotice(t("revoked"));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(t("error")));
    } finally {
      setPending("");
    }
  }
  return (
    <>
      <PageHeading title={t("clients")}>{t("clientIntro")}</PageHeading>
      <form
        className="eval-panel eval-create"
        onSubmit={create}
        aria-busy={pending === "create"}
      >
        <Field
          id="client-name"
          label={t("clientName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={160}
          required
          disabled={!!pending}
        />
        <Button type="submit" disabled={!!pending || !name.trim()}>
          {pending === "create" ? t("creating") : t("create")}
        </Button>
      </form>
      {notice && <Status>{notice}</Status>}
      {error && <Status error>{error.message}</Status>}
      {[error, loadError].some(
        (e) => e instanceof EvalRequestError && e.status === 401,
      ) && <SessionRecovery />}
      {loading ? (
        <Status>{t("loading")}</Status>
      ) : loadError ? (
        <>
          <Status error>{loadError.message}</Status>
          <Button variant="outline" onClick={load}>
            {t("retry")}
          </Button>
        </>
      ) : !workspaces.length ? (
        <EmptyState title={t("noClients")}>
          <p>{t("noClientsBody")}</p>
        </EmptyState>
      ) : (
        <DataTable caption={t("clients")} headers={[t("client"), t("access")]}>
          {workspaces.map((w) => (
            <tr key={w.id}>
              <th scope="row">{w.name}</th>
              <td>
                <Button
                  variant={selected === w.id ? "secondary" : "outline"}
                  disabled={!!pending}
                  aria-pressed={selected === w.id}
                  aria-label={`${t("selectClient")}: ${w.name}`}
                  onClick={() => selectClient(w.id)}
                >
                  {selected === w.id ? t("selectedClient") : t("selectClient")}
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {pending === "list" && <Status>{t("loading")}</Status>}
      {client && (
        <section
          className="eval-panel eval-invites"
          aria-labelledby="invite-heading"
        >
          <div className="eval-section-heading">
            <p className="eval-eyebrow">{t("selectedClient")}</p>
            <h2 id="invite-heading">{client.name}</h2>
            <p>{t("inviteHelp")}</p>
          </div>
          <form
            className="eval-form"
            onSubmit={invite}
            aria-busy={pending === "invite"}
          >
            <Field
              id="invite-email"
              label={t("email")}
              type="email"
              maxLength={254}
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!pending}
            />
            <div className="eval-field">
              <label htmlFor="invite-role">{t("role")}</label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={!!pending}
              >
                <option value="viewer">{t("viewer")}</option>
                <option value="editor">{t("editor")}</option>
                <option value="owner">{t("owner")}</option>
              </select>
            </div>
            <Button type="submit" disabled={!!pending}>
              {pending === "invite" ? t("inviting") : t("invite")}
            </Button>
          </form>
          {!!invitations.filter((i) => i.workspaceId === client.id).length && (
            <div className="eval-invitation-list">
              <h3>{t("currentInvites")}</h3>
              <p>{t("inviteSessionHelp")}</p>
              {invitations
                .filter((i) => i.workspaceId === client.id)
                .map((invitation) => (
                  <div className="eval-invitation" key={invitation.id}>
                    <strong>{invitation.email}</strong>
                    <span>
                      {invitation.role} ·{" "}
                      {invitation.revoked_at
                        ? t("revoked")
                        : invitation.accepted_at
                          ? t("accepted")
                          : t("pendingInvitation")}
                    </span>
                    {invitation.token && (
                      <Field
                        id={`link-${invitation.id}`}
                        label={t("invitationLink")}
                        readOnly
                        value={`${window.location.origin}${invitationPath(invitation.token)}`}
                        onFocus={(e) => e.target.select()}
                      />
                    )}
                    <Button
                      variant="outline"
                      disabled={
                        !!pending ||
                        !!invitation.revoked_at ||
                        !!invitation.accepted_at
                      }
                      onClick={() => revoke(invitation.id)}
                    >
                      {pending === invitation.id ? t("revoking") : t("revoke")}
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
