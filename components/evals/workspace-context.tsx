"use client";

/**
 * The workspace a person is currently acting in.
 *
 * One source of truth for every workspace-scoped screen, replacing a picker on
 * each page. Resolution order: an explicit `?orgId` in the URL (deep links and
 * shared links win), then the last choice on this device, then the first
 * workspace. Changing it rewrites `?orgId` so the URL always states its scope.
 * Authorization is still enforced server-side on every request.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { EvalIdentity } from "@/lib/evals/domain/identity";

type Workspace = EvalIdentity["workspaces"][number];
type WorkspaceState = {
  workspaces: Workspace[];
  orgId: string;
  workspace: Workspace | undefined;
  role: Workspace["role"] | "";
  canWrite: boolean;
  canManage: boolean;
  operator: boolean;
  setOrgId: (id: string) => void;
  /** Append the current workspace to an internal href. */
  withOrg: (href: string, id?: string) => string;
};

const STORAGE_KEY = "caudals.workspace";
const Context = createContext<WorkspaceState | null>(null);

const subscribeNever = () => () => undefined;

function remembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ identity, children }: { identity: EvalIdentity; children: ReactNode }) {
  const workspaces = identity.workspaces;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("orgId");
  const valid = useCallback((id: string | null) => !!id && workspaces.some((item) => item.id === id), [workspaces]);
  const [chosen, setChosen] = useState<string | null>(null);
  // Storage is device state, unavailable on the server: read it as an external store.
  const stored = useSyncExternalStore(subscribeNever, remembered, () => null);

  // Workspaces can change underneath (a client was just created): fall back to the first.
  const orgId = valid(requested) ? requested! : valid(chosen) ? chosen! : valid(stored) ? stored! : workspaces[0]?.id ?? "";

  useEffect(() => {
    if (!orgId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, orgId);
    } catch {
      /* preference is best-effort */
    }
  }, [orgId]);

  const setOrgId = useCallback(
    (id: string) => {
      if (!valid(id)) return;
      setChosen(id);
      // A detail page belongs to one workspace; switching returns to its list.
      const segments = pathname.split("/").filter(Boolean);
      const target = segments[0] === "workspace" && segments.length > 2 ? `/${segments[0]}/${segments[1]}` : pathname;
      const next = new URLSearchParams(target === pathname ? params.toString() : "");
      next.set("orgId", id);
      router.replace(`${target}?${next.toString()}`);
    },
    [params, pathname, router, valid, setChosen],
  );

  const withOrg = useCallback(
    (href: string, id = orgId) => {
      if (!id) return href;
      const [path, query = ""] = href.split("?");
      const next = new URLSearchParams(query);
      next.set("orgId", id);
      return `${path}?${next.toString()}`;
    },
    [orgId],
  );

  const value = useMemo<WorkspaceState>(() => {
    const workspace = workspaces.find((item) => item.id === orgId);
    const role = workspace?.role ?? "";
    return {
      workspaces,
      orgId,
      workspace,
      role,
      canWrite: ["owner", "editor", "operator"].includes(role),
      canManage: ["owner", "operator"].includes(role),
      operator: identity.platformRole === "operator" || identity.platformRole === "platform_admin",
      setOrgId,
      withOrg,
    };
  }, [identity.platformRole, orgId, setOrgId, withOrg, workspaces]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkspace must be used inside EvalShell");
  return value;
}

/* ------------------------------------------------------------ page title -- */

type CrumbState = { label: string | null; setLabel: (label: string | null) => void };
const CrumbContext = createContext<CrumbState>({ label: null, setLabel: () => undefined });

export function CrumbProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Keyed by path, so a label never leaks onto the next screen.
  const [entry, setEntry] = useState<{ path: string; label: string | null }>({ path: pathname, label: null });
  const setLabel = useCallback((label: string | null) => setEntry({ path: pathname, label }), [pathname]);
  const label = entry.path === pathname ? entry.label : null;
  const value = useMemo(() => ({ label, setLabel }), [label, setLabel]);
  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>;
}

/** Name the current detail page in the breadcrumb once its title is known. */
export function usePageCrumb(label: string | null | undefined) {
  const { setLabel } = useContext(CrumbContext);
  useEffect(() => {
    setLabel(label ?? null);
  }, [label, setLabel]);
}

export function useCrumbLabel() {
  return useContext(CrumbContext).label;
}
