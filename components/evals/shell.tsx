"use client";

/**
 * Platform shell: sidebar, topbar and the floating content canvas.
 *
 * Three planes, and the whole language depends on keeping them distinct:
 *   1. chrome  — the warm backdrop the sidebar lives on, no border
 *   2. canvas  — a white rounded panel that scrolls independently
 *   3. content — cards and tables inside the canvas
 *
 * Visual contract: packages/brand/platform.css. See docs/DESIGN.md.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LogOut,
  Mail,
  DatabaseZap,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
  Users,
  Unplug,
  Cpu,
  Activity,
  Wallet,
  UserCog,
  ScrollText,
  ListChecks,
  FileStack,
  Boxes,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { betterAuthClient } from "./auth-client";
import { evalRequest } from "./api";
import { t } from "@/lib/evals/messages/en";
import type { EvalIdentity } from "@/lib/evals/domain/identity";

type NavItem = { href: string; label: string; icon: ReactNode };
type NavGroup = { label?: string; items: NavItem[] };

/* Breadcrumb labels. A route missing here falls back to a humanised segment,
   so a new page is never labelled with a raw slug for long. */
const CRUMBS: Record<string, string> = {
  ops: "Operations",
  clients: t("clients"),
  evaluations: t("product"),
  improvements: t("improvementDatasets"),
  review: t("reviewQueue"),
  reports: t("reports"),
  platform: t("platform"),
  runs: "Runs",
  workspace: "Workspace",
  systems: t("systems"),
  settings: t("settings"),
  invitations: t("invitations"),
  new: t("newEvaluationAction"),
  "test-sets": "Test sets",
  library: "Library",
  sources: "Sources",
  "domain-packs": "Domain packs",
  inference: "Inference",
  usage: "Usage & budgets",
  accounts: "Accounts",
  audit: "Audit log",
};

function crumbLabel(segment: string) {
  if (CRUMBS[segment]) return CRUMBS[segment];
  // Opaque ids (uuids, hashes) are not useful breadcrumbs — show a short form.
  if (/^[0-9a-f-]{16,}$/i.test(segment)) return `${segment.slice(0, 8)}…`;
  const words = segment.replaceAll("-", " ");
  return words[0]?.toUpperCase() + words.slice(1);
}

function navFor(identity: EvalIdentity, expert = false, hasTestSets = false): NavGroup[] {
  const operator =
    identity.platformRole === "operator" || identity.platformRole === "platform_admin";
  const groups: NavGroup[] = [];

  if (operator) {
    groups.push(
      { items: [{ href: "/ops", label: t("overview"), icon: <LayoutGrid /> }] },
      {
        label: "Deliver",
        items: [
          { href: "/ops/clients", label: t("clients"), icon: <Building2 /> },
          { href: "/ops/evaluations", label: t("product"), icon: <FlaskConical /> },
          { href: "/ops/review", label: t("reviewQueue"), icon: <ClipboardCheck /> },
          { href: "/ops/reports", label: t("reports"), icon: <FileText /> },
        ],
      },
      {
        label: "Library",
        items: [
          { href: "/ops/library/test-sets", label: "Test sets", icon: <ListChecks /> },
          { href: "/ops/library/sources", label: "Sources", icon: <FileStack /> },
          { href: "/ops/library/domain-packs", label: "Domain packs", icon: <Boxes /> },
          { href: "/ops/improvements", label: t("improvementDatasets"), icon: <DatabaseZap /> },
        ],
      },
      {
        label: "Platform",
        items: [
          { href: "/ops/platform", label: "Providers & models", icon: <Cpu /> },
          { href: "/ops/platform/inference", label: "Inference", icon: <Activity /> },
          { href: "/ops/platform/usage", label: "Usage & budgets", icon: <Wallet /> },
          { href: "/ops/platform/accounts", label: "Accounts", icon: <UserCog /> },
          { href: "/ops/platform/audit", label: "Audit log", icon: <ScrollText /> },
        ],
      },
      {
        label: "Experts",
        items: [
          { href: "/ops/experts", label: t("expertWork"), icon: <Users /> },
        ],
      },
    );
  }

  /* Group labels earn their place. A sidebar with a heading above every single
     item is noise, so the workspace items stay in one group and only carry a
     label when an operator nav sits above them and needs disambiguating. */
  if (identity.workspaces.length) {
    groups.push({
      label: operator ? "Workspace" : undefined,
      items: [
        { href: "/workspace/evaluations", label: t("product"), icon: <FlaskConical /> },
        { href: "/workspace/systems", label: t("systems"), icon: <Plug /> },
        { href: "/workspace/reports", label: t("reports"), icon: <FileText /> },
      ],
    });
  }

  if (expert) {
    groups.push({
      label: "Expert",
      items: [{ href: "/review", label: t("assignedWork"), icon: <ClipboardCheck /> }],
    });
  }

  groups.push({
    label: "Account",
    items: [
      ...(identity.workspaces.length
        ? [{ href: "/workspace/settings", label: t("settings"), icon: <Settings /> }]
        : []),
      { href: "/workspace/invitations", label: t("invitations"), icon: <Mail /> },
    ],
  });

  return groups;
}

function isCurrent(pathname: string, href: string) {
  if (href === "/ops" || href === "/ops/platform") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(identity: EvalIdentity) {
  const source = identity.user.name || identity.user.email;
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).slice(0, 2) || source.slice(0, 2);
}

/* ------------------------------------------------------------------ nav --- */

function Nav({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav id="p-sidebar-nav" className="p-nav" aria-label={t("navigation")}>
      {groups.map((group, index) => (
        <div className="p-nav-group" key={group.label ?? `group-${index}`}>
          {group.label && <p className="p-nav-label">{group.label}</p>}
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="p-nav-item"
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              // On the rail the label is visually collapsed but stays in the
              // DOM, so the link keeps its accessible name. `title` gives mouse
              // users the same information the sighted label used to.
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

/** Full lockup when there is room, the mark alone on the rail. */
function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link className="p-brand" href="/evaluation-entry" aria-label={t("brand")}>
      <Image
        className="p-brand-mark"
        src="/caudals_logo_black.svg"
        alt=""
        width={32}
        height={32}
        priority
      />
      {!collapsed && <span className="p-brand-name">Caudals</span>}
    </Link>
  );
}

/* -------------------------------------------------------------- account --- */

function AccountMenu({
  identity,
  signingOut,
  onSignOut,
}: {
  identity: EvalIdentity;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const operator =
    identity.platformRole === "operator" || identity.platformRole === "platform_admin";
  const workspace = identity.workspaces[0];
  /* Modal is the Radix default and is kept deliberately: a non-modal menu
     portalled inside the mobile drawer (itself a modal dialog) cannot be
     reopened reliably. Selecting an item closes the menu, which lifts the
     aria-hidden it puts on the shell, so a status the shell then reports —
     a sign-out failure — is reachable. */
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="p-account">
          <span className="p-avatar" aria-hidden="true">
            {initials(identity)}
          </span>
          <span className="p-account-text">
            <span className="p-account-name">
              {identity.user.name || identity.user.email}
            </span>
            <span className="p-account-meta">
              {operator ? t("ops") : (workspace?.name ?? t("customer"))}
            </span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        className="p-menu"
      >
        <p className="p-menu-label">{identity.user.email}</p>
        <DropdownMenuSeparator className="p-menu-sep" />
        {identity.workspaces.length > 0 && (
          <DropdownMenuItem asChild className="p-menu-item">
            <Link href="/workspace/settings">
              <Settings aria-hidden="true" />
              {t("settings")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="p-menu-item">
          <Link href="/workspace/invitations">
            <Mail aria-hidden="true" />
            {t("invitations")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-menu-item">
          <a href="mailto:hello@caudals.com?subject=Caudals%20platform">
            <LifeBuoy aria-hidden="true" />
            Contact Caudals
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="p-menu-sep" />
        <DropdownMenuItem
          className="p-menu-item"
          data-tone="danger"
          disabled={signingOut}
          onSelect={() => onSignOut()}
        >
          {signingOut ? <Loader2 aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          {t(signingOut ? "signingOut" : "signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------- shell --- */

export function EvalShell({
  identity,
  expert = false,
  children,
}: {
  identity: EvalIdentity;
  expert?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [hasTestSets, setHasTestSets] = useState(false);
  const workspaceIds = useMemo(() => identity.workspaces.map((workspace) => workspace.id), [identity.workspaces]);
  const groups = navFor(identity, expert, hasTestSets);

  useEffect(() => {
    let active = true;
    void Promise.all(workspaceIds.map(async (workspaceId) => {
      try {
        const items = await evalRequest<Array<{ suite_version_id: string }>>(`/suites?orgId=${encodeURIComponent(workspaceId)}`);
        return items.length > 0;
      } catch { return false; }
    })).then((results) => { if (active) setHasTestSets(results.some(Boolean)); });
    return () => { active = false; };
  }, [workspaceIds]);

  /* The sidebar state is a per-device preference, not account data. */
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("caudals.sidebar") === "collapsed");
    } catch {
      /* private mode or blocked storage — the default is correct */
    }
  }, []);

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
      // A full navigation discards private client state and cached route data.
      window.location.replace("/workspace/sign-in");
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    label: crumbLabel(segment),
    href: `/${segments.slice(0, index + 1).join("/")}`,
    last: index === segments.length - 1,
  }));

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
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
          </div>
          <Nav groups={groups} collapsed={collapsed} />
          <div className="p-sidebar-foot">
            {signOutError && (
              <p role="alert" className="p-status" data-tone="error">
                <Unplug aria-hidden="true" />
                <span>{t("signOutError")}</span>
              </p>
            )}
            <AccountMenu identity={identity} signingOut={signingOut} onSignOut={signOut} />
          </div>
        </aside>

        <div className="p-body">
          <header className="p-topbar">
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="p-btn p-mobile-only"
                  data-variant="ghost"
                  data-shape="icon"
                  aria-label={t("openNavigation")}
                >
                  <PanelLeftOpen aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-root p-drawer">
                <SheetTitle asChild>
                  <span className="p-brand" style={{ marginBottom: 6 }}>
                    <Image
                      className="p-brand-mark"
                      src="/caudals_logo_black.svg"
                      alt=""
                      width={32}
                      height={32}
                    />
                    <span className="p-brand-name">Caudals</span>
                  </span>
                </SheetTitle>
                <SheetDescription className="p-nav-label" style={{ marginBottom: 10 }}>
                  {identity.platformRole === "operator" ||
                  identity.platformRole === "platform_admin"
                    ? t("ops")
                    : t("customer")}
                </SheetDescription>
                <Nav groups={groups} onNavigate={() => setDrawer(false)} />
                <div className="p-sidebar-foot">
                  {/* The failure has to be reported in whichever shell the
                      person is actually looking at, drawer included. */}
                  {signOutError && (
                    <p role="alert" className="p-status" data-tone="error">
                      <Unplug aria-hidden="true" />
                      <span>{t("signOutError")}</span>
                    </p>
                  )}
                  <AccountMenu
                    identity={identity}
                    signingOut={signingOut}
                    onSignOut={signOut}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <nav aria-label="Breadcrumb">
              <ol className="p-crumbs">
                {crumbs.map((crumb) => (
                  <li key={crumb.href}>
                    {crumb.last ? (
                      <span aria-current="page">{crumb.label}</span>
                    ) : (
                      <>
                        <Link href={crumb.href}>{crumb.label}</Link>
                        <ChevronRight className="p-crumb-sep" size={13} aria-hidden="true" />
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <span className="p-topbar-spacer" />

            <div className="p-topbar-actions">
              <a
                className="p-btn"
                data-variant="secondary"
                data-shape="pill"
                href="mailto:hello@caudals.com?subject=Caudals%20platform"
              >
                <LifeBuoy aria-hidden="true" />
                Help
              </a>
            </div>
          </header>

          <main id="p-main" className="p-canvas" tabIndex={-1}>
            <div className="p-page">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
