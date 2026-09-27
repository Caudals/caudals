"use client";

/**
 * Platform shell: sidebar, topbar and the floating content canvas.
 *
 * Three planes, and the whole language depends on keeping them distinct:
 *   1. chrome  — the warm backdrop the sidebar lives on, no border
 *   2. canvas  — a white rounded panel that scrolls independently
 *   3. content — tables and sections inside the canvas
 *
 * Navigation is role-aware and deliberately short: the workspace a person is
 * acting in sits at the top of the sidebar, its three or four screens below,
 * and operators get one Operations group. Everything else is a tab inside
 * one of those screens. Visual contract: packages/brand/platform.css.
 */

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  Cpu,
  FileText,
  FlaskConical,
  LayoutGrid,
  LibraryBig,
  LifeBuoy,
  ListChecks,
  Loader2,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Search,
  Settings,
  Unplug,
  Users,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { betterAuthClient } from "./auth-client";
import { evalRequest, SESSION_EXPIRED_EVENT } from "./api";
import { evaluationRecoveryPath, evaluationSignInPath } from "./auth-path";
import { ActionLink, Status, humanize } from "./primitives";
import { Toaster } from "./overlays";
import { CommandPalette, type PaletteLink } from "./command-palette";
import { CrumbProvider, WorkspaceProvider, useCrumbLabel, useWorkspace } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";
import type { EvalIdentity } from "@/lib/evals/domain/identity";

type NavItem = { href: string; label: string; icon: ReactNode; match?: (path: string) => boolean; scoped?: boolean };
type NavGroup = { label?: string; items: NavItem[] };
export type ShellFeatures = { experts: boolean };

const prefix = (value: string) => (path: string) => path === value || path.startsWith(`${value}/`);

function navFor(identity: EvalIdentity, features: ShellFeatures, expert: boolean, hasTestSets: boolean): NavGroup[] {
  const operator = identity.platformRole === "operator" || identity.platformRole === "platform_admin";
  const groups: NavGroup[] = [];
  if (identity.workspaces.length) {
    groups.push({
      items: [
        { href: "/workspace/evaluations", label: t("product"), icon: <FlaskConical />, scoped: true },
        { href: "/workspace/systems", label: t("systems"), icon: <Plug />, scoped: true },
        { href: "/workspace/reports", label: t("reports"), icon: <FileText />, scoped: true },
        ...(hasTestSets ? [{ href: "/workspace/test-sets", label: t("testSets"), icon: <ListChecks />, scoped: true }] : []),
      ],
    });
  }
  if (operator) {
    groups.push({
      label: t("operations"),
      items: [
        { href: "/ops", label: t("overview"), icon: <LayoutGrid />, match: (path) => path === "/ops" || path.startsWith("/ops/runs") || path === "/ops/evaluations" || path === "/ops/reports" },
        { href: "/ops/clients", label: t("clients"), icon: <Building2 /> },
        { href: "/ops/review", label: t("reviewQueue"), icon: <ClipboardCheck /> },
        { href: "/ops/library/test-sets", label: t("library"), icon: <LibraryBig />, match: (path) => path.startsWith("/ops/library") || path.startsWith("/ops/improvements") },
        ...(features.experts ? [{ href: "/ops/experts", label: t("expertWork"), icon: <Users /> }] : []),
        { href: "/ops/platform", label: t("platform"), icon: <Cpu />, match: prefix("/ops/platform") },
      ],
    });
  }
  if (expert) groups.push({ label: t("expert"), items: [{ href: "/review", label: t("assignedWork"), icon: <ClipboardCheck /> }] });
  return groups;
}

function isCurrent(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : prefix(item.href)(pathname);
}

function initials(identity: EvalIdentity) {
  const source = identity.user.name || identity.user.email;
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).slice(0, 2) || source.slice(0, 2);
}

/* ----------------------------------------------------------- breadcrumbs --- */

const SECTION: Record<string, string> = {
  evaluations: t("product"),
  systems: t("systems"),
  reports: t("reports"),
  "test-sets": t("testSets"),
  settings: t("settings"),
  invitations: t("invitations"),
  clients: t("clients"),
  review: t("reviewQueue"),
  experts: t("expertWork"),
  sources: t("sources"),
  "domain-packs": t("domainPacks"),
  improvements: t("improvementDatasets"),
  inference: t("inference"),
  usage: t("usageBudgets"),
  accounts: t("accounts"),
  audit: t("auditLog"),
};
const DETAIL: Record<string, string> = {
  evaluations: t("evaluation"),
  reports: t("report"),
  "test-sets": t("testSet"),
  runs: t("run"),
  assignments: t("assignment"),
};

type Crumb = { label: string; href?: string };

function crumbsFor(pathname: string, detail: string | null): Crumb[] {
  const s = pathname.split("/").filter(Boolean);
  const name = (segment: string) => SECTION[segment] ?? humanize(segment.replaceAll("-", "_"));
  if (s[0] === "workspace") {
    const section = s[1] ?? "evaluations";
    if (s.length <= 2) return [{ label: name(section) }];
    const base = { label: name(section), href: `/workspace/${section}` };
    if (s[2] === "new") return [base, { label: t("newEvaluationAction") }];
    return [base, { label: detail ?? DETAIL[section] ?? t("details") }];
  }
  if (s[0] === "ops") {
    if (!s[1] || s[1] === "evaluations" || s[1] === "reports") return [{ label: t("overview") }];
    if (s[1] === "runs") return [{ label: t("overview"), href: "/ops" }, { label: detail ?? t("run") }];
    if (s[1] === "library" || s[1] === "improvements")
      return [{ label: t("library"), href: "/ops/library/test-sets" }, { label: name(s[1] === "improvements" ? "improvements" : s[2] ?? "test-sets") }];
    if (s[1] === "platform") return [{ label: t("platform"), href: "/ops/platform" }, { label: s[2] ? name(s[2]) : t("providersModels") }];
    return [{ label: name(s[1]) }];
  }
  if (s[0] === "review") {
    if (s.length === 1) return [{ label: t("assignedWork") }];
    return [{ label: t("assignedWork"), href: "/review" }, { label: detail ?? t("assignment") }];
  }
  return [];
}

function Breadcrumbs() {
  const pathname = usePathname();
  const detail = useCrumbLabel();
  const { withOrg } = useWorkspace();
  const crumbs = crumbsFor(pathname, detail);
  const page = crumbs.at(-1)?.label;
  // Name the browser tab after the page. Route metadata rewrites <title> on
  // client navigations (including query changes), so re-apply after it does.
  useEffect(() => {
    if (!page) return;
    const wanted = `${page} · Caudals`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [page]);
  if (!crumbs.length) return null;
  return (
    <nav aria-label={t("breadcrumb")} className="p-crumbs-nav">
      <ol className="p-crumbs">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`}>
            {index > 0 && <ChevronRight className="p-crumb-sep" size={13} aria-hidden="true" />}
            {crumb.href && index < crumbs.length - 1 ? (
              <Link href={crumb.href.startsWith("/workspace") ? withOrg(crumb.href) : crumb.href}>{crumb.label}</Link>
            ) : (
              <span aria-current={index === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------- session --- */

/**
 * One place answers an expired session: any API call that returns 401 raises
 * the event, and the page is replaced by a way back in that returns here.
 * The page stays mounted underneath so nothing typed is thrown away.
 */
function SessionExpiry({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);
  const here = typeof window === "undefined" ? pathname : `${pathname}${window.location.search}`;
  // The invitation page offers its own recovery, which keeps the bearer in the
  // fragment; a generic sign-in link here would lose the invitation.
  if (pathname === "/workspace/invitations") return <>{children}</>;
  return (
    <>
      {expired && (
        <Status
          error
          action={
            <span className="p-row">
              <ActionLink size="sm" href={evaluationSignInPath(here)}>
                {t("signInAgain")}
              </ActionLink>
              <ActionLink size="sm" variant="ghost" href={evaluationRecoveryPath(here)}>
                {t("recovery")}
              </ActionLink>
            </span>
          }
        >
          {t("expired")}
        </Status>
      )}
      <div hidden={expired}>{children}</div>
    </>
  );
}

/* ------------------------------------------------------------------ nav --- */

function Nav({ groups, collapsed = false, onNavigate }: { groups: NavGroup[]; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { withOrg } = useWorkspace();
  return (
    <nav id="p-sidebar-nav" className="p-nav" aria-label={t("navigation")}>
      {groups.map((group, index) => (
        <div className="p-nav-group" key={group.label ?? `group-${index}`}>
          {group.label && <p className="p-nav-label">{group.label}</p>}
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.scoped ? withOrg(item.href) : item.href}
              className="p-nav-item"
              aria-current={isCurrent(pathname, item) ? "page" : undefined}
              // On the rail the label is visually collapsed but stays in the
              // DOM, so the link keeps its accessible name.
              title={collapsed ? item.label : undefined}
              onClick={onNavigate}
            >
              {item.icon}
              <span className="p-nav-label-text">{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link className="p-brand" href="/evaluation-entry" aria-label={t("brand")}>
      <Image className="p-brand-mark" src="/caudals_logo_black.svg" alt="" width={32} height={32} priority />
      {!collapsed && <span className="p-brand-name">Caudals</span>}
    </Link>
  );
}

/* ---------------------------------------------------- workspace switcher --- */

function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { workspaces, workspace, setOrgId, operator, role } = useWorkspace();
  if (!workspace) return null;
  const mark = <span className="p-ws-mark" aria-hidden="true">{workspace.name.slice(0, 1).toUpperCase()}</span>;
  const text = (
    <span className="p-ws-text">
      <span className="p-ws-name">{workspace.name}</span>
      <span className="p-ws-meta">{operator && role === "operator" ? t("clientWorkspace") : t(role || "viewer")}</span>
    </span>
  );
  if (workspaces.length < 2 && !operator)
    return (
      <div className="p-ws" title={collapsed ? workspace.name : undefined}>
        {mark}
        {text}
      </div>
    );
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger asChild>
        <button type="button" className="p-ws" data-interactive="true" aria-label={`${t("workspace")}: ${workspace.name}. ${t("switchWorkspace")}`} title={collapsed ? workspace.name : undefined}>
          {mark}
          {text}
          <ChevronsUpDown className="p-ws-chevron" aria-hidden="true" />
        </button>
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content className="p-root p-menu p-ws-menu" align="start" sideOffset={6} collisionPadding={8}>
          <MenuPrimitive.Label className="p-menu-label">{operator ? t("clients") : t("workspaces")}</MenuPrimitive.Label>
          <div className="p-ws-list">
            {workspaces.map((item) => (
              <MenuPrimitive.Item key={item.id} className="p-menu-item" onSelect={() => setOrgId(item.id)}>
                <span className="p-ws-mark" data-size="sm" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
                <span className="p-menu-text">{item.name}</span>
                {item.id === workspace.id && <Check className="p-menu-check" aria-label={t("current")} />}
              </MenuPrimitive.Item>
            ))}
          </div>
          {operator && (
            <>
              <MenuPrimitive.Separator className="p-menu-sep" />
              <MenuPrimitive.Item asChild className="p-menu-item">
                <Link href="/ops/clients">
                  <Building2 aria-hidden="true" />
                  {t("manageClients")}
                </Link>
              </MenuPrimitive.Item>
            </>
          )}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/* -------------------------------------------------------------- account --- */

function AccountMenu({ identity, signingOut, onSignOut }: { identity: EvalIdentity; signingOut: boolean; onSignOut: () => void }) {
  const operator = identity.platformRole === "operator" || identity.platformRole === "platform_admin";
  /* Modal is the Radix default and is kept deliberately: selecting an item
     closes the menu, which lifts the aria-hidden it puts on the shell, so a
     status the shell then reports — a sign-out failure — is reachable. */
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger asChild>
        <button type="button" className="p-account">
          <span className="p-avatar" aria-hidden="true">{initials(identity)}</span>
          <span className="p-account-text">
            <span className="p-account-name">{identity.user.name || identity.user.email}</span>
            <span className="p-account-meta">{identity.platformRole === "platform_admin" ? t("platformAdmin") : operator ? t("operatorRole") : identity.user.email}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" />
        </button>
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content className="p-root p-menu" side="top" align="start" sideOffset={6} collisionPadding={8}>
          <MenuPrimitive.Label className="p-menu-label">{identity.user.email}</MenuPrimitive.Label>
          <MenuPrimitive.Separator className="p-menu-sep" />
          <MenuPrimitive.Item asChild className="p-menu-item">
            <Link href="/workspace/invitations">
              <Mail aria-hidden="true" />
              {t("invitations")}
            </Link>
          </MenuPrimitive.Item>
          <MenuPrimitive.Item asChild className="p-menu-item">
            <a href="mailto:hello@caudals.com?subject=Caudals%20platform">
              <LifeBuoy aria-hidden="true" />
              {t("contactCaudals")}
            </a>
          </MenuPrimitive.Item>
          <MenuPrimitive.Separator className="p-menu-sep" />
          <MenuPrimitive.Item className="p-menu-item" data-tone="danger" disabled={signingOut} onSelect={() => onSignOut()}>
            {signingOut ? <Loader2 aria-hidden="true" /> : <LogOut aria-hidden="true" />}
            {t(signingOut ? "signingOut" : "signOut")}
          </MenuPrimitive.Item>
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/* ------------------------------------------------------------ sidebar --- */

function SidebarBody({
  identity,
  groups,
  collapsed,
  signingOut,
  signOutError,
  onSignOut,
  onNavigate,
}: {
  identity: EvalIdentity;
  groups: NavGroup[];
  collapsed: boolean;
  signingOut: boolean;
  signOutError: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { workspace, withOrg } = useWorkspace();
  return (
    <>
      <WorkspaceSwitcher collapsed={collapsed} />
      <Nav groups={groups} collapsed={collapsed} onNavigate={onNavigate} />
      <div className="p-sidebar-foot">
        {workspace && (
          <Link
            href={withOrg("/workspace/settings")}
            className="p-nav-item"
            aria-current={pathname.startsWith("/workspace/settings") ? "page" : undefined}
            title={collapsed ? t("settings") : undefined}
            onClick={onNavigate}
          >
            <Settings />
            <span className="p-nav-label-text">{t("settings")}</span>
          </Link>
        )}
        {signOutError && (
          <p role="alert" className="p-status" data-tone="error">
            <Unplug aria-hidden="true" />
            <span>{t("signOutError")}</span>
          </p>
        )}
        <AccountMenu identity={identity} signingOut={signingOut} onSignOut={onSignOut} />
      </div>
    </>
  );
}

/* --------------------------------------------------------------- frame --- */

function Frame({ identity, expert, features, children }: { identity: EvalIdentity; expert: boolean; features: ShellFeatures; children: ReactNode }) {
  const pathname = usePathname();
  const { orgId, withOrg } = useWorkspace();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [hasTestSets, setHasTestSets] = useState(false);
  const groups = navFor(identity, features, expert, hasTestSets);

  // Test sets are a secondary workflow: the entry appears once one exists.
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    void evalRequest<unknown[]>(`/suites?orgId=${encodeURIComponent(orgId)}&grouped=1`)
      .then((items) => live && setHasTestSets(items.length > 0))
      .catch(() => live && setHasTestSets(false));
    return () => {
      live = false;
    };
  }, [orgId]);

  /* The sidebar state is a per-device preference, not account data. */
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("caudals.sidebar") === "collapsed");
    } catch {
      /* private mode or blocked storage — the default is correct */
    }
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("caudals.sidebar", next ? "collapsed" : "open");
      } catch {
        /* preference is best-effort */
      }
      return next;
    });
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      const result = await betterAuthClient.signOut();
      if (result.error) throw new Error("sign-out-failed");
      try {
        window.localStorage.removeItem("caudals.workspace");
      } catch {
        /* nothing to clear */
      }
      // A full navigation discards private client state and cached route data.
      window.location.replace("/workspace/sign-in");
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  const paletteLinks: PaletteLink[] = groups.flatMap((group) =>
    group.items.map((item) => ({ href: item.scoped ? withOrg(item.href) : item.href, label: item.label, icon: item.icon, group: group.label ?? t("goTo") })),
  );
  if (identity.workspaces.length) paletteLinks.push({ href: withOrg("/workspace/settings"), label: t("settings"), icon: <Settings />, group: t("goTo") });

  const sidebarProps = { identity, groups, signingOut, signOutError, onSignOut: signOut };

  return (
    <div className="p-root">
      <a className="p-skip" href="#p-main">
        {t("skip")}
      </a>
      <div className="p-shell" data-collapsed={collapsed ? "true" : "false"}>
        <aside className="p-sidebar">
          <div className="p-sidebar-head">
            <Brand collapsed={collapsed} />
            <button
              type="button"
              className="p-btn"
              data-variant="ghost"
              data-shape="icon"
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              aria-controls="p-sidebar-nav"
              aria-label={collapsed ? t("expandNavigation") : t("collapseNavigation")}
              title={collapsed ? t("expandNavigation") : t("collapseNavigation")}
            >
              {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            </button>
          </div>
          <SidebarBody {...sidebarProps} collapsed={collapsed} />
        </aside>

        <div className="p-body">
          <header className="p-topbar">
            <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
              <DialogPrimitive.Trigger asChild>
                <button type="button" className="p-btn p-mobile-only" data-variant="ghost" data-shape="icon" aria-label={t("openNavigation")}>
                  <Menu aria-hidden="true" />
                </button>
              </DialogPrimitive.Trigger>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="p-scrim" />
                <DialogPrimitive.Content className="p-root p-drawer" aria-describedby={undefined}>
                  <DialogPrimitive.Title asChild>
                    <div className="p-sidebar-head">
                      <Brand />
                    </div>
                  </DialogPrimitive.Title>
                  <SidebarBody {...sidebarProps} collapsed={false} onNavigate={() => setDrawer(false)} />
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <Breadcrumbs />
            <span className="p-topbar-spacer" />
            <div className="p-topbar-actions">
              <button type="button" className="p-searchbar" onClick={() => setPalette(true)} aria-keyshortcuts="Meta+K Control+K">
                <Search aria-hidden="true" />
                <span className="p-searchbar-text">{t("search")}…</span>
                <kbd className="p-kbd">⌘K</kbd>
              </button>
              <a className="p-btn p-desktop-only" data-variant="secondary" data-size="sm" href="mailto:hello@caudals.com?subject=Caudals%20platform">
                {t("help")}
              </a>
            </div>
          </header>

          <main id="p-main" className="p-canvas" tabIndex={-1}>
            <div className="p-page">
              <SessionExpiry>{children}</SessionExpiry>
            </div>
          </main>
        </div>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} links={paletteLinks} />
      <Toaster />
    </div>
  );
}

export function ShellFrame({
  identity,
  expert = false,
  features,
  children,
}: {
  identity: EvalIdentity;
  expert?: boolean;
  features: ShellFeatures;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <WorkspaceProvider identity={identity}>
        <CrumbProvider>
          <Frame identity={identity} expert={expert} features={features}>
            {children}
          </Frame>
        </CrumbProvider>
      </WorkspaceProvider>
    </Suspense>
  );
}
