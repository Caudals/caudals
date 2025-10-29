import React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function DashboardHeader({
  title,
  description,
  breadcrumbs,
}: DashboardHeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:min-h-12">
      <div className="flex w-full flex-1 flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <div className="flex min-w-0 flex-col gap-1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumb className="flex min-w-0 flex-wrap text-xs text-muted-foreground sm:text-sm">
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.label}>
                    <BreadcrumbItem className="truncate">
                      {crumb.href ? (
                        <BreadcrumbLink href={crumb.href}>
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {description && (
            <p className="text-xs text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
