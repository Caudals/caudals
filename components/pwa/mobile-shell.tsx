"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  UploadCloud,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

const NAV_ITEMS = [
  {
    href: "/pwa",
    label: "Browse",
    icon: Compass,
    match: (pathname: string) =>
      pathname === "/pwa" || pathname.startsWith("/pwa/datasets"),
  },
  {
    href: "/pwa/submissions",
    label: "Uploads",
    icon: UploadCloud,
    match: (pathname: string) => pathname.startsWith("/pwa/submissions"),
  },
  {
    href: "/pwa/resources",
    label: "Guides",
    icon: Sparkles,
    match: (pathname: string) => pathname.startsWith("/pwa/resources"),
  },
];

interface MobileShellProps {
  children: ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  const pathname = usePathname();
  const isHome = pathname === "/pwa";

  const pageTitle = pathname.startsWith("/pwa/submissions")
    ? "Uploads timeline"
    : pathname.startsWith("/pwa/resources")
      ? "Contributor guides"
      : pathname.startsWith("/pwa/datasets")
        ? "Dataset brief"
        : "Browse briefs";

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <div className="relative isolate overflow-hidden px-5 pb-4 pt-6">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-emerald-500/15 via-blue-500/5 to-fuchsia-500/10 blur-3xl" />
        {isHome ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Caudals Companion
                </p>
                <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                  Contributions on the go
                </h1>
                <p className="mt-1 text-sm text-white/70">
                  Upload samples, track rewards, and stay aligned with your
                  favorite dataset briefs.
                </p>
              </div>
              <Link
                href="/browse"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-xs text-white/80 backdrop-blur"
                aria-label="Open desktop marketplace"
              >
                <LayoutDashboard className="h-5 w-5" />
              </Link>
            </div>
            <div className="mt-5 flex gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2">
                <p className="text-[11px] uppercase tracking-wide text-white/60">
                  Sync status
                </p>
                <p className="text-sm font-semibold text-white">Realtime</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2">
                <p className="text-[11px] uppercase tracking-wide text-white/60">
                  Rewards paid
                </p>
                <p className="text-sm font-semibold text-white">$3.2M</p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                Caudals Companion
              </p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                {pageTitle}
              </h1>
              <p className="text-sm text-white/70">
                Access your mobile workspace without touching the desktop site.
              </p>
            </div>
            <Link
              href="/browse"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-xs text-white/80 backdrop-blur"
              aria-label="Open desktop marketplace"
            >
              <LayoutDashboard className="h-5 w-5" />
            </Link>
          </div>
        )}
      </div>

      <main className="flex-1 px-5 pb-32">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-around gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.match(pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium transition",
                  isActive
                    ? "bg-white/10 text-white shadow-[0_4px_20px_rgba(15,23,42,0.4)]"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
