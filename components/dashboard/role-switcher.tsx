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

interface RoleSwitcherProps {
  userRole: string;
  currentView: string; // "admin", "requester", or "contributor"
}

export function RoleSwitcher({ userRole, currentView }: RoleSwitcherProps) {
  const router = useRouter();
  const [selectedView, setSelectedView] = useState<string>(currentView);
  const t = useTranslations();

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

  return (
    <div className="px-2">
      <Select value={selectedView} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>{t("Admin View")}</span>
            </div>
          </SelectItem>
          <SelectItem value="requester">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              <span>{t("Requester View")}</span>
            </div>
          </SelectItem>
          <SelectItem value="contributor">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{t("Contributor View")}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
