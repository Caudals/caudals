import type { UserRole } from "./database";
import type { LucideIcon } from "lucide-react";

export type RouteDefinition = {
  path: string;
  label: string;
  icon?: LucideIcon;
  roles?: UserRole[];
  children?: RouteDefinition[];
};

export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number | string;
  shortcut?: string;
  roles: UserRole[];
  group?: string;
};
