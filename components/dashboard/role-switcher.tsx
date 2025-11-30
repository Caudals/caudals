"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Briefcase, User, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useSidebar } from "@/components/ui/sidebar";

interface RoleSwitcherProps {
  userRole: string;
  currentView: string; // "admin", "requester", or "contributor"
}

export function RoleSwitcher({ userRole, currentView }: RoleSwitcherProps) {
  const router = useRouter();
  const [selectedView, setSelectedView] = useState<string>(currentView);
  const t = useTranslations();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  useEffect(() => {
    // Update local state when parent changes view
    setSelectedView(currentView);
  }, [currentView]);

  const handleChange = (value: string) => {
    setSelectedView(value);
    // Use Next.js router for navigation
    if (value === "contributor") {
      router.push("/dashboard/contributor");
    } else if (value === "requester") {
      router.push("/dashboard");
    } else if (value === "admin") {
      router.push("/admin");
    }
  };

  // Only admins can switch views
  if (userRole !== "admin") {
    return null; // Don't show anything for non-admin users
  }

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="px-2">
      <Select value={selectedView} onValueChange={handleChange}>
        <SelectTrigger className="w-full h-8 text-xs font-medium bg-sidebar-accent/50 border-0 focus:ring-0 focus:ring-offset-0 text-muted-foreground hover:text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" />
              <span className="text-xs">{t("Admin View")}</span>
            </div>
          </SelectItem>
          <SelectItem value="requester">
            <div className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5" />
              <span className="text-xs">{t("Requester View")}</span>
            </div>
          </SelectItem>
          <SelectItem value="contributor">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              <span className="text-xs">{t("Contributor View")}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
