import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type RequesterPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function RequesterPageHeader({
  title,
  description,
  actions,
  className,
}: RequesterPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-6 border-b border-border/40 mb-6",
        className,
      )}
    >
      <div className="flex items-stretch gap-3">
        <div className="w-1.5 rounded-full bg-[var(--accent)]/80" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm text-slate-500 leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
