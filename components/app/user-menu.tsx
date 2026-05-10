"use client";

import {
  User,
  Settings,
  LogOut,
  Moon,
  Sun,
  Globe,
  Keyboard,
  FileText,
  HelpCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/provider";
import { useTranslations } from "@/lib/i18n/use-translations";
import { resolveSettingsHref } from "@/lib/navigation/role-view";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { user, userRole } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const userInitials = user?.user_metadata?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || "U";

  const settingsHref = resolveSettingsHref(pathname, userRole);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={user?.user_metadata?.avatar_url}
              alt={user?.email || "User"}
            />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user?.user_metadata?.full_name || t("User")}
            </p>
            <p className="text-xs leading-none text-slate-500">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push(settingsHref)}>
            <User className="mr-2 h-4 w-4" />
            <span>{t("Profile")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(settingsHref)}>
            <Settings className="mr-2 h-4 w-4" />
            <span>{t("Settings")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <Moon className="mr-2 h-4 w-4" />
            <span>{t("Theme")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Globe className="mr-2 h-4 w-4" />
            <span>{t("Language")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>{t("Keyboard Shortcuts")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <FileText className="mr-2 h-4 w-4" />
            <span>{t("Documentation")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>{t("Support")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/auth/sign-out")}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t("Sign Out")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
