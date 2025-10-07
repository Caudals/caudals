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
import { usePathname } from "next/navigation";

interface RoleSwitcherProps {
  userRole: string;
}

export function RoleSwitcher({ userRole }: RoleSwitcherProps) {
  const pathname = usePathname();
  const [selectedView, setSelectedView] = useState<string>(() => {
    // Determine initial view based on current path
    if (pathname.startsWith("/admin")) return "admin";
    if (pathname.startsWith("/dashboard/contributor")) return "contributor";
    return "requester";
  });

  useEffect(() => {
    // Update view when pathname changes
    if (pathname.startsWith("/admin")) {
      setSelectedView("admin");
    } else if (pathname.startsWith("/dashboard/contributor")) {
      setSelectedView("contributor");
    } else if (pathname.startsWith("/dashboard")) {
      setSelectedView("requester");
    }
  }, [pathname]);

  const handleChange = (value: string) => {
    setSelectedView(value);
    // Redirect to appropriate dashboard based on selected view
    if (value === "contributor") {
      window.location.href = "/dashboard/contributor";
    } else if (value === "requester") {
      window.location.href = "/dashboard";
    } else if (value === "admin") {
      window.location.href = "/admin";
    }
  };

  // Only admins can switch views, regular users see their role only
  const canSwitchViews = userRole === "admin";

  if (!canSwitchViews) {
    // Show current role only
    return (
      <div className="px-2">
        <Badge variant="secondary" className="w-full justify-start gap-2 py-2 text-xs">
          {userRole === "requester" ? (
            <>
              <Briefcase className="h-3.5 w-3.5" />
              Requester
            </>
          ) : userRole === "contributor" ? (
            <>
              <User className="h-3.5 w-3.5" />
              Contributor
            </>
          ) : (
            <>
              <Shield className="h-3.5 w-3.5" />
              Admin
            </>
          )}
        </Badge>
      </div>
    );
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
              <span>Admin View</span>
            </div>
          </SelectItem>
          <SelectItem value="requester">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              <span>Requester View</span>
            </div>
          </SelectItem>
          <SelectItem value="contributor">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Contributor View</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
