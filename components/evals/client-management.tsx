"use client";

/**
 * Clients (spec §5.5 step 1): create a client workspace without creating a
 * login, then invite its people. Each client row opens its access panel; the
 * workspace itself is one click away through the workspace switcher.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { t } from "@/lib/evals/messages/runtime";
import { Action, ActionLink, DataTable, DefinitionList, EmptyState, Field, FilterChips, PageHeading, formatMoney, SearchInput, Status, TableSkeleton, Time, Toolbar } from "./primitives";
import type { ClientDetail } from "@/lib/analytics/ops-kpis";
import { ActionMenu, Modal, SidePanel, notify } from "./overlays";
import { RenameDialog } from "./item-actions";
import { InvitationManager } from "./invitation-manager";
import { useClientSummaries } from "./operator-overview";
import { evalRequest } from "./api";

type Workspace = { id: string; name: string };
type KindFilter = "all" | "client" | "payg" | "partner" | "free" | "snapshot";
const credits = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatMoney(value));

export function ClientManagement() {
  const router = useRouter();
  const { clients, reload } = useClientSummaries();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
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
  // Plan, credits, activity and email domain (launch L-21); the table works without them.
  const [details, setDetails] = useState<Map<string, ClientDetail>>(new Map());
  const [kind, setKind] = useState<KindFilter>("all");
  useEffect(() => {
    evalRequest<ClientDetail[]>("/client-details").then((rows) => setDetails(new Map(rows.map((row) => [row.orgId, row])))).catch(() => undefined);
  }, [clients?.length]);

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
  // Plans v2 (L-14): pay as you go and partner workspaces get their own filter instead of counting as managed (L-16).
  const kindOf = (id: string): Exclude<KindFilter, "all"> => {
    const row = details.get(id);
    if (row?.kind === "client" && row.plan === "payg") return "payg";
    if (row?.kind === "client" && row.plan === "partner") return "partner";
    return (row?.kind as Exclude<KindFilter, "all" | "payg" | "partner"> | undefined) ?? "client";
  };
  const counts = { all: clients?.length ?? 0, client: 0, payg: 0, partner: 0, free: 0, snapshot: 0 } as Record<KindFilter, number>;
  for (const client of clients ?? []) counts[kindOf(client.id)]++;
  const visible = (clients ?? [])
    .filter((client) => kind === "all" || kindOf(client.id) === kind)
    .filter((client) => !needle || `${client.name} ${details.get(client.id)?.emailDomain ?? ""}`.toLowerCase().includes(needle));
  const lastActivity = (id: string) => {
    const summary = clients?.find((client) => client.id === id)?.summary;
    return details.get(id)?.lastActivity ?? (summary?.evaluations.map((item) => item.updated_at ?? "").sort().at(-1) || null);
  };
  const planLabel = (id: string) => {
    const row = details.get(id);
    if (!row) return "—";
    if (row.kind === "snapshot") return t("clientKindSnapshot");
    // Plans v2 (launch L-14): pay as you go and partner workspaces list with the clients.
    return row.plan === "free" ? t("clientPlanFree") : row.plan === "payg" ? t("clientPlanPayg") : row.plan === "partner" ? t("clientPlanPartner") : t("clientPlanManaged");
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
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} label={t("searchClientsDomains")} />
          </Toolbar>
          <div className="p-toolbar">
            <FilterChips value={kind} onChange={setKind} label={t("filterClients")} options={[
              { value: "all", label: t("allClients"), count: counts.all },
              { value: "client", label: t("clientPlanManaged"), count: counts.client },
              { value: "payg", label: t("clientPlanPayg"), count: counts.payg },
              ...(counts.partner ? [{ value: "partner" as const, label: t("clientPlanPartner"), count: counts.partner }] : []),
              { value: "free", label: t("clientPlanFree"), count: counts.free },
              { value: "snapshot", label: t("clientKindSnapshot"), count: counts.snapshot },
            ]} />
          </div>
          <DataTable caption={t("clients")} headers={[t("client"), t("clientPlan"), { label: t("clientCredits"), align: "end" }, { label: t("product"), align: "end" }, { label: t("reports"), align: "end" }, { label: t("lastActivity"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
            {visible.map((client) => (
              <tr key={client.id}>
                <th scope="row">
                  <span className="p-table-primary">
                    <button type="button" className="p-row-link p-row-button" onClick={() => setOpenId(client.id)}>
                      {client.name}
                    </button>
                    {details.get(client.id)?.emailDomain && <span className="p-cell-meta">{details.get(client.id)?.emailDomain}</span>}
                    {client.error && <span className="p-cell-meta">{t("summaryUnavailable")}</span>}
                  </span>
                </th>
                <td>{planLabel(client.id)}</td>
                <td className="p-num">{credits(details.get(client.id)?.credits)}{details.get(client.id)?.creditsBought != null && <span className="p-cell-meta"> · {credits(details.get(client.id)?.creditsBought)} {t("clientBought")}</span>}</td>
                <td className="p-num">{client.summary?.evaluations.length ?? "—"}</td>
                <td className="p-num">{client.summary?.reports.length ?? "—"}</td>
                <td className="p-table-action p-cell-meta">
                  <Time value={lastActivity(client.id)} />
                </td>
                <td className="p-table-action">
                  <ActionMenu
                    label={`${t("moreActions")}: ${client.name}`}
                    items={[
                      { label: t("rename"), icon: <Pencil />, onSelect: () => setRenaming({ id: client.id, name: client.name }) },
                      { separator: true },
                      { label: t("deleteWorkspace"), icon: <Trash2 />, href: `/workspace/settings?orgId=${encodeURIComponent(client.id)}&tab=danger` },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      {renaming && (
        <RenameDialog
          title={t("renameWorkspace")}
          label={t("workspaceName")}
          initial={renaming.name}
          maxLength={120}
          onClose={() => setRenaming(null)}
          onSave={async (value) => {
            await evalRequest(`/workspaces/${renaming.id}`, "PATCH", { name: value });
            router.refresh();
            await reload();
          }}
        />
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
