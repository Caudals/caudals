"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  publicNavigationLinks,
  type PublicNavigationLink,
} from "@/lib/navigation/public-links";
import { useTranslations } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { LocaleLink as Link } from "@/components/i18n/locale-link";

interface HeaderProps {
  links?: readonly PublicNavigationLink[];
  translucent?: boolean;
}

const REQUEST_ACCESS_CTA = "/contact";

export function Header({ links, translucent = false }: HeaderProps) {
  const t = useTranslations("nav");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = links && links.length > 0 ? links : publicNavigationLinks;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "bg-background/40 backdrop-blur-[22px]"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-8 px-6 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 transition-opacity hover:opacity-90">
          <Image
            src="/caudals_logo_black.svg"
            alt={t("logoAlt")}
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span className="text-xl font-medium tracking-tight text-black">
            {t("brand")}
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map(({ href, labelKey }) => (
            <Link
              key={href}
              href={href}
              className="text-[14px] font-medium text-gray-600 transition-colors hover:text-black"
            >
              {t(labelKey)}
            </Link>
          ))}
          <LanguageSwitcher />
          <Button size="sm" asChild className="rounded-md px-5 bg-black text-white hover:bg-black/90">
            <Link href={REQUEST_ACCESS_CTA}>{t("getStarted")}</Link>
          </Button>
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto md:hidden text-black hover:bg-black/5">
              <Menu className="h-5 w-5" />
              <span className="sr-only">{t("toggleMenu")}</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="bg-background px-0 pb-0 pt-0 text-black border-l border-black/[0.08]"
          >
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-black/[0.08] px-6 pb-5 pt-6">
                <SheetTitle className="sr-only">{t("brand")}</SheetTitle>
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt={t("logoAlt")}
                    width={24}
                    height={24}
                    className="h-6 w-6"
                    priority
                  />
                  <span className="text-lg font-bold text-black">{t("brand")}</span>
                </Link>
              </SheetHeader>

              <ScrollArea className="flex-1 px-6">
                <div className="flex flex-col gap-6 py-8">
                  {navLinks.map(({ href, labelKey }) => (
                    <SheetClose asChild key={href}>
                      <Link
                        href={href}
                        className="text-lg font-bold text-gray-600 hover:text-black"
                      >
                        {t(labelKey)}
                      </Link>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <Button size="sm" asChild className="w-full rounded-md bg-black text-white hover:bg-black/90">
                      <Link href={REQUEST_ACCESS_CTA}>{t("getStarted")}</Link>
                    </Button>
                  </SheetClose>
                  <LanguageSwitcher className="pt-2 text-base" />
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
