"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth/provider";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "@/lib/i18n/use-translations";

interface HeaderProps {
  links?: Array<{ label: string; href: string }>;
  translucent?: boolean;
  hideActions?: boolean;
}

const DEFAULT_LINKS = [
  { href: "/browse", label: "Browse" },
  { href: "/collaborate", label: "Partnerships" },
  { href: "/trust", label: "Trust" },
];

export function Header({ links, translucent = false, hideActions = false }: HeaderProps) {
  const { user, loading, userRole } = useAuth();
  const t = useTranslations();
  
  // Only hide nav/actions when deploy is in landing mode (NEXT_PUBLIC_* set at build time)
  const isLandingMode =
    process.env.NEXT_PUBLIC_LANDING_MODE === "true" || hideActions;
  
  const navLinks =
    links && links.length > 0 ? links : isLandingMode ? [] : DEFAULT_LINKS;

  const dashboardHref =
    userRole === "admin"
      ? "/admin"
      : userRole === "contributor"
        ? "/contributor"
        : "/requester";

  const renderDesktopActions = () => {
    // Don't show actions in landing mode
    if (isLandingMode) {
      return null;
    }

    if (loading) {
      return (
        <div className="flex items-center gap-3">
          <div className="h-9 w-24 animate-pulse rounded-full bg-muted/60" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-muted/60" />
        </div>
      );
    }

    return user ? (
      <Button size="sm" asChild>
            <Link href={dashboardHref}>{t("Dashboard")}</Link>
          </Button>
        ) : (
          <>
            <Button size="sm" asChild variant="outline">
              <Link href="/auth/sign-in">{t("Sign in")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/sign-up">{t("Sign up")}</Link>
            </Button>
          </>
        );
  };

  const renderMobileActions = () => {
    // Don't show actions in landing mode
    if (isLandingMode) {
      return null;
    }

    if (loading) {
      return (
        <div className="flex flex-col gap-3">
          <div className="h-10 w-full animate-pulse rounded-full bg-muted/60" />
          <div className="h-10 w-full animate-pulse rounded-full bg-muted/60" />
        </div>
      );
    }

    return user ? (
      <SheetClose asChild>
        <Button size="sm" asChild className="w-full">
          <Link href={dashboardHref}>{t("Dashboard")}</Link>
        </Button>
      </SheetClose>
    ) : (
      <>
        <SheetClose asChild>
          <Button size="sm" variant="outline" asChild>
            <Link href="/auth/sign-in">{t("Sign in")}</Link>
          </Button>
        </SheetClose>
        <SheetClose asChild>
          <Button size="sm" asChild>
            <Link href="/auth/sign-up">{t("Sign up")}</Link>
          </Button>
        </SheetClose>
      </>
    );
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-colors",
        translucent
          ? "border-white/40 bg-white/30 backdrop-blur-xl supports-[backdrop-filter]:bg-white/20"
          : "border-border bg-background/80 backdrop-blur-lg",
      )}
    >
      <div className="container mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/caudals_logo_black.svg"
            alt={t("Caudals logo")}
            width={24}
            height={24}
            className="h-6 w-6"
            priority
          />
          <span className="text-xl font-semibold tracking-tight">
            {t("Caudals")}
          </span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(label)}
            </Link>
          ))}

          {renderDesktopActions()}
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">{t("Toggle menu")}</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="bg-background px-0 pb-0 pt-0 text-foreground"
          >
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border/60 px-6 pb-5 pt-6">
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt={t("Caudals logo")}
                    width={24}
                    height={24}
                    className="h-6 w-6"
                    priority
                  />
                  <span className="text-lg font-semibold">{t("Caudals")}</span>
                </Link>
              </SheetHeader>

              <ScrollArea className="flex-1 px-6">
                <div className="flex flex-col gap-4 py-6">
                  {navLinks.map(({ href, label }) => (
                    <SheetClose asChild key={href}>
                      <Link
                        href={href}
                        className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t(label)}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </ScrollArea>

              {!isLandingMode && (
                <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-6">
                  {renderMobileActions()}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
