import type { ReactNode } from "react";

type DashboardHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function DashboardHeader({ title, description, actions }: DashboardHeaderProps) {
  return (
    <div className="border-b bg-background/95 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
