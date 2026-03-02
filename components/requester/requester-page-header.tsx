import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type RequesterPageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function RequesterPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: RequesterPageHeaderProps) {
  return (
    <header
      className={cn(
        "rounded-2xl border border-border/70 bg-gradient-to-br from-primary/5 via-background to-background p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/80">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
