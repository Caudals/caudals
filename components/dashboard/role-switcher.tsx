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

interface RoleSwitcherProps {
  userRole: string;
}

export function RoleSwitcher({ userRole }: RoleSwitcherProps) {
  const [selectedView, setSelectedView] = useState<string>("requester");

  useEffect(() => {
    // Load saved preference
    const saved = localStorage.getItem("dashboardView");
    if (saved) {
      setSelectedView(saved);
    }
  }, []);

  const handleChange = (value: string) => {
    setSelectedView(value);
    localStorage.setItem("dashboardView", value);
    // Redirect to appropriate dashboard based on selected view
    if (value === "contributor") {
      window.location.href = "/dashboard/contributor";
    } else if (value === "requester") {
      window.location.href = "/dashboard";
    } else if (value === "admin") {
      window.location.href = "/admin";
    }
  };

  // Only admins can switch roles, regular users are restricted to their role
  const canSwitchRoles = userRole === "admin";

  if (!canSwitchRoles) {
    // Show current role only
    return (
      <div className="px-2">
        <Badge variant="secondary" className="w-full justify-start gap-2 py-2">
          {userRole === "requester" ? (
            <>
              <Briefcase className="h-4 w-4" />
              Requester
            </>
          ) : userRole === "contributor" ? (
            <>
              <User className="h-4 w-4" />
              Contributor
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
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
          {userRole === "admin" && (
            <SelectItem value="admin">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Admin View</span>
              </div>
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
