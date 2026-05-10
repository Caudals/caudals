"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
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
import {
  landingModePublicEnabled,
  landingModePublicNavigationLinks,
} from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

interface HeaderProps {
  links?: Array<{ label: string; href: string }>;
  translucent?: boolean;
  hideActions?: boolean;
}

const DEFAULT_LINKS = [
  { href: "/contact", label: "Contact" },
  { href: "/blog", label: "Blog" },
  { href: "/trust", label: "Trust" },
];
const REQUESTER_SIGN_UP_CTA =
  "/auth/sign-up?role=requester&next=/requester/onboarding";

export function Header({ links, translucent = false, hideActions = false }: HeaderProps) {
  const { user, loading, userRole } = useAuth();
  const t = useTranslations();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  const isLandingMode = landingModePublicEnabled || hideActions;
  
  const navLinks =
    links && links.length > 0
      ? links
      : isLandingMode
        ? [...landingModePublicNavigationLinks]
        : DEFAULT_LINKS;

  const dashboardHref =
    userRole === "admin"
      ? "/admin"
      : userRole === "contributor"
        ? "/contributor"
        : "/requester";

  const renderDesktopActions = () => {
    if (isLandingMode) {
      return null;
    }

    if (loading) {
      return (
        <div className="flex items-center gap-3">
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted/60" />
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted/60" />
        </div>
      );
    }

    return user ? (
      <Button size="sm" asChild className="rounded-md px-5 bg-black text-white hover:bg-black/90">
            <Link href={dashboardHref}>{t("Dashboard")}</Link>
          </Button>
        ) : (
          <>
            <Button size="sm" asChild variant="outline" className="rounded-md px-5 border-gray-200 text-black hover:bg-gray-50">
              <Link href="/auth/sign-in">{t("Sign in")}</Link>
            </Button>
            <Button size="sm" asChild className="rounded-md px-5 bg-black text-white hover:bg-black/90">
              <Link href={REQUESTER_SIGN_UP_CTA}>{t("Sign up")}</Link>
            </Button>
          </>
        );
  };

  const renderMobileActions = () => {
    if (isLandingMode) {
      return null;
    }

    if (loading) {
      return (
        <div className="flex flex-col gap-3">
          <div className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
          <div className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
        </div>
      );
    }

    return user ? (
      <SheetClose asChild>
        <Button size="sm" asChild className="w-full rounded-md bg-black text-white">
          <Link href={dashboardHref}>{t("Dashboard")}</Link>
        </Button>
      </SheetClose>
    ) : (
      <>
        <SheetClose asChild>
          <Button size="sm" variant="outline" asChild className="w-full rounded-md border-gray-200 text-black">
            <Link href="/auth/sign-in">{t("Sign in")}</Link>
          </Button>
        </SheetClose>
        <SheetClose asChild>
          <Button size="sm" asChild className="w-full rounded-md bg-black text-white">
            <Link href={REQUESTER_SIGN_UP_CTA}>{t("Sign up")}</Link>
          </Button>
        </SheetClose>
      </>
    );
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "border-b border-white/35 bg-white/40 backdrop-blur-[22px] shadow-[0_18px_40px_-30px_rgba(15,23,42,0.32)]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-6 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <Image
            src="/caudals_logo_black.svg"
            alt={t("Caudals logo")}
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span className="text-xl font-medium tracking-tight text-black">
            {t("Caudals")}
          </span>
        </Link>
        <nav className="hidden items-center gap-10 md:flex">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-[14px] font-medium text-gray-500 transition-colors hover:text-black"
            >
              {t(label)}
            </Link>
          ))}

          <div className="ml-4 h-6 w-px bg-gray-100" />
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
            className="bg-white px-0 pb-0 pt-0 text-black"
          >
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-gray-100 px-6 pb-5 pt-6">
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt={t("Caudals logo")}
                    width={24}
                    height={24}
                    className="h-6 w-6"
                    priority
                  />
                  <span className="text-lg font-bold text-black">{t("Caudals")}</span>
                </Link>
              </SheetHeader>

              <ScrollArea className="flex-1 px-6">
                <div className="flex flex-col gap-6 py-8">
                  {navLinks.map(({ href, label }) => (
                    <SheetClose asChild key={href}>
                      <Link
                        href={href}
                        className="text-lg font-bold text-gray-500 hover:text-black"
                      >
                        {t(label)}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </ScrollArea>

              {!isLandingMode && (
                <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-8">
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
