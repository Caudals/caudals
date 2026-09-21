"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useInternalTranslations } from "@/lib/i18n/internal";
import { useBreadcrumbs } from "@/lib/navigation/use-breadcrumbs";

export function Breadcrumbs() {
  const pathname = usePathname();
  const t = useInternalTranslations();
  const breadcrumbs = useBreadcrumbs(pathname);

  // Don't show breadcrumbs on mobile (< md)
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex">
      <ol className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const label = t(crumb.label);

          return (
            <li key={crumb.href || index} className="flex items-center gap-2">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
              {isLast || !crumb.href ? (
                <span className="font-medium text-foreground">{label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-slate-500 hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
