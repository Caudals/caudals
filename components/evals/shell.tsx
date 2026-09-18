"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { betterAuthClient } from "./auth-client";
import { Status } from "./primitives";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { t } from "@/lib/evals/messages/en";
import type { EvalIdentity } from "@/lib/evals/domain/identity";

export function EvalShell({
  identity,
  children,
}: {
  identity: EvalIdentity;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
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
  const account = (
    <div className="eval-account">
      <span>{t("signedIn")}</span>
      <strong>{identity.user.email}</strong>
      <Button
        type="button"
        variant="outline"
        disabled={signingOut}
        onClick={signOut}
      >
        {t(signingOut ? "signingOut" : "signOut")}
      </Button>
      {signOutError && <Status error>{t("signOutError")}</Status>}
    </div>
  );
  const operator =
    identity.platformRole === "operator" ||
    identity.platformRole === "platform_admin";
  const links = [
    ...(operator ? [
      { href: "/ops", label: t("overview") },
      { href: "/ops/clients", label: t("clients") },
      { href: "/ops/evaluations", label: t("product") },
      { href: "/ops/review", label: t("reviewQueue") },
      { href: "/ops/reports", label: t("reports") },
      { href: "/ops/platform", label: t("platform") },
    ] : []),
    ...(identity.workspaces.length
      ? [
          { href: "/workspace/evaluations", label: t("product") },
          { href: "/workspace/systems", label: t("systems") },
          { href: "/workspace/reports", label: t("reports") },
          { href: "/workspace/settings", label: t("settings") },
        ]
      : []),
    { href: "/workspace/invitations", label: t("invitations") },
  ];
  const nav = (
    <nav aria-label={t("navigation")}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="eval-shell" lang="en">
      <a className="eval-skip" href="#eval-main">
        {t("skip")}
      </a>
      <aside className="eval-sidebar">
        <Link className="eval-brand" href="/evaluation-entry">
          {t("brand")}
        </Link>
        <p className="eval-eyebrow">{operator ? t("ops") : t("customer")}</p>
        {nav}
        {account}
      </aside>
      <div className="eval-body">
        <header className="eval-context">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="eval-mobile-menu"
                aria-label={t("openNavigation")}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="eval-drawer motion-reduce:animate-none"
            >
              <SheetTitle>{t("brand")}</SheetTitle>
              <SheetDescription>
                {operator ? t("ops") : t("customer")}
              </SheetDescription>
              {nav}
              {account}
            </SheetContent>
          </Sheet>
          <span>{pathname.startsWith("/ops") ? t("ops") : t("customer")}</span>
          <span className="eval-context-user">
            {identity.user.name || identity.user.email}
          </span>
        </header>
        <main id="eval-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
