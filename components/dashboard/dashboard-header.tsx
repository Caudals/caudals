import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ChevronDown, CheckCircle2 } from "lucide-react";

interface DashboardHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function DashboardHeader({
  title,
  description,
  children,
}: DashboardHeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 border-b bg-white px-6 py-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {children}
          <Button variant="outline" size="sm" className="h-8 gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>Things to do</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </header>
  );
}
