import { useMemo } from "react";
import type { BreadcrumbItem } from "@/types/navigation";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Admin",
  requests: "Requests",
  contributors: "Contributors",
  analytics: "Analytics",
  billing: "Billing",
  settings: "Settings",
  contributor: "Contributor",
  contributions: "Contributions",
  earnings: "Earnings",
  datasets: "Datasets",
  submissions: "Submissions",
  users: "Users",
  new: "New",
  pwa: "PWA",
  upload: "Upload",
};

export function useBreadcrumbs(pathname: string): BreadcrumbItem[] {
  return useMemo(() => {
    // Remove leading/trailing slashes and split
    const segments = pathname.replace(/^\/|\/$/g, "").split("/");

    // Filter out empty segments and route groups
    const filteredSegments = segments.filter(
      (segment) => segment && !segment.startsWith("(")
    );

    if (filteredSegments.length === 0) {
      return [];
    }

    const breadcrumbs: BreadcrumbItem[] = [];
    let currentPath = "";

    filteredSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === filteredSegments.length - 1;

      // Get label from route labels or use segment
      let label = routeLabels[segment] || segment;

      // Handle dynamic segments like [id]
      if (segment.match(/^[\d\w-]+$/i) && !routeLabels[segment]) {
        // If it looks like an ID, use the previous segment's singular form + ID
        if (index > 0) {
          const prevLabel = breadcrumbs[index - 1]?.label || "";
          // For now, just show the ID. In production, you'd fetch the actual name
          label = `#${segment}`;
        }
      }

      breadcrumbs.push({
        label,
        href: isLast ? undefined : currentPath,
        current: isLast,
      });
    });

    // Limit to 3 breadcrumbs max for cleanliness
    if (breadcrumbs.length > 3) {
      return [
        breadcrumbs[0],
        { label: "...", href: undefined },
        breadcrumbs[breadcrumbs.length - 1],
      ];
    }

    return breadcrumbs;
  }, [pathname]);
}
