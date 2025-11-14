"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, UploadCloud, LayoutDashboard, Settings2 } from "lucide-react";
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
    href: "/pwa/upload",
    label: "Upload",
    icon: UploadCloud,
    match: (pathname: string) => pathname.startsWith("/pwa/upload"),
  },
  {
    href: "/pwa/settings",
    label: "Settings",
    icon: Settings2,
    match: (pathname: string) => pathname.startsWith("/pwa/settings"),
  },
];

interface MobileShellProps {
  children: ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  const pathname = usePathname();
  const pageTitle = pathname.startsWith("/pwa/upload")
    ? "Contribute uploads"
    : pathname.startsWith("/pwa/settings")
      ? "Settings"
      : pathname.startsWith("/pwa/datasets")
        ? "Dataset brief"
        : "Browse briefs";

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-white/50">
            Caudals
          </p>
          <p className="text-lg font-semibold leading-tight text-white">{pageTitle}</p>
        </div>
        <Link
          href="/browse"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 text-white/70 transition hover:bg-white/10"
          aria-label="Open desktop marketplace"
        >
          <LayoutDashboard className="h-5 w-5" />
        </Link>
      </header>

      <main className="flex-1 px-5 pb-32 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-slate-950/95 px-4 py-3 backdrop-blur">
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
