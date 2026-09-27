"use client";

/**
 * Clients (spec §5.5 step 1): create a client workspace without creating a
 * login, then invite its people. Each client row opens its access panel; the
 * workspace itself is one click away through the workspace switcher.
 */
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { t } from "@/lib/evals/messages/en";
import { Action, ActionLink, DataTable, DefinitionList, EmptyState, Field, PageHeading, formatMoney, SearchInput, Status, TableSkeleton, Time, Toolbar } from "./primitives";
import { Modal, SidePanel, notify } from "./overlays";
import { InvitationManager } from "./invitation-manager";
import { useClientSummaries } from "./operator-overview";
import { evalRequest } from "./api";

type Workspace = { id: string; name: string };

export function ClientManagement() {
  const router = useRouter();
  const { clients, reload } = useClientSummaries();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const keyFor = (value: string) => {
    let key = keys.current.get(value);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(value, key);
    }
    return key;
  };
  const open = clients?.find((client) => client.id === openId) ?? null;

  async function create(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    setPending(true);
    setError("");
    try {
      const workspace = await evalRequest<Workspace>("/workspaces", "POST", { name: value }, keyFor(value));
      keys.current.delete(value);
      setName("");
      setCreating(false);
      notify(`${t("clientCreated")} ${workspace.name}`);
      // Identity (and so the workspace switcher) is read on the server.
      router.refresh();
      await reload();
      setOpenId(workspace.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = (clients ?? []).filter((client) => !needle || client.name.toLowerCase().includes(needle));
  const lastActivity = (id: string) => {
    const summary = clients?.find((client) => client.id === id)?.summary;
    return summary?.evaluations.map((item) => item.updated_at ?? "").sort().at(-1) || null;
  };

  return (
    <>
      <PageHeading
        title={t("clients")}
        actions={
          clients?.length ? (
            <Action onClick={() => { setError(""); setCreating(true); }}>
              <Plus aria-hidden="true" />
              {t("newClient")}
            </Action>
          ) : undefined
        }
      >
        {t("clientIntro")}
      </PageHeading>
      {clients === null ? (
        <TableSkeleton columns={4} />
      ) : !clients.length ? (
        <EmptyState
          title={t("noClients")}
          icon={<Building2 />}
          action={
            <Action onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              {t("newClient")}
            </Action>
          }
        >
          <p>{t("noClientsBody")}</p>
        </EmptyState>
      ) : (
        <>
          {clients.length > 6 && (
            <Toolbar>
              <SearchInput value={query} onChange={setQuery} label={t("searchClients")} />
            </Toolbar>
          )}
          <DataTable caption={t("clients")} headers={[t("client"), { label: t("product"), align: "end" }, { label: t("reports"), align: "end" }, { label: t("lastActivity"), align: "end" }]}>
            {visible.map((client) => (
              <tr key={client.id}>
                <th scope="row">
                  <span className="p-table-primary">
                    <button type="button" className="p-row-link p-row-button" onClick={() => setOpenId(client.id)}>
                      {client.name}
                    </button>
                    {client.error && <span className="p-cell-meta">{t("summaryUnavailable")}</span>}
                  </span>
                </th>
                <td className="p-num">{client.summary?.evaluations.length ?? "—"}</td>
                <td className="p-num">{client.summary?.reports.length ?? "—"}</td>
                <td className="p-table-action p-cell-meta">
                  <Time value={lastActivity(client.id)} />
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t("newClient")}
        description={t("newClientHelp")}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setCreating(false)}>
              {t("cancel")}
            </Action>
            <Action type="submit" form="client-form" disabled={pending || !name.trim()}>
              {pending ? t("creating") : t("createClient")}
            </Action>
          </>
        }
      >
        <form id="client-form" onSubmit={create} className="p-stack">
          {error && <Status error>{error}</Status>}
          <Field id="client-name" label={t("clientName")} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus />
        </form>
      </Modal>

      <SidePanel
        open={!!open}
        onOpenChange={(value) => !value && setOpenId(null)}
        title={open?.name ?? t("client")}
        description={t("clientPanelHelp")}
        wide
        footer={
          open && (
            <ActionLink href={`/workspace/evaluations?orgId=${open.id}`}>
              {t("openWorkspace")}
              <ArrowRight aria-hidden="true" />
            </ActionLink>
          )
        }
      >
        {open && (
          <>
            {open.summary && (
              <DefinitionList
                items={[
                  { term: t("product"), value: open.summary.evaluations.length },
                  { term: t("systems"), value: open.summary.systems.length },
                  { term: t("reportsPublished"), value: open.summary.reports.length },
                  { term: t("monthlyLimit"), value: formatMoney(open.summary.entitlement.monthly_spend_limit, open.summary.entitlement.currency) },
                  { term: t("spendThisMonth"), value: formatMoney(Number(open.summary.usage.settled) + Number(open.summary.usage.outstanding), open.summary.entitlement.currency) },
                ]}
              />
            )}
            <InvitationManager orgId={open.id} workspaceName={open.name} />
          </>
        )}
      </SidePanel>
    </>
  );
}
