import React from "react";

interface ContributorPageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function ContributorPageHeader({
  title,
  description,
  children,
}: ContributorPageHeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center border-b border-border/70 bg-card px-4 py-3 sm:px-6">
      <div className="flex w-full items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
    </header>
  );
}
