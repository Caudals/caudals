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
}

/** The free diagnostic, preselected on the contact form. */
const DIAGNOSTIC_CTA = "/contact?offer=reality-check";

const pillClass =
  "rounded-full bg-[#141413] px-4 text-[13px] font-medium text-[#f5f4f0] transition-[opacity,transform] duration-200 hover:bg-[#141413] hover:opacity-85 active:scale-[0.97]";

export function Header({ links }: HeaderProps) {
  const t = useTranslations("nav");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = links && links.length > 0 ? links : publicNavigationLinks;

  return (
    <header
      className={cn(
        "font-mk-sans sticky top-0 z-50 w-full transition-colors duration-300",
        isScrolled ? "bg-background/80 backdrop-blur-[14px] backdrop-saturate-150" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-8 px-[clamp(16px,4vw,40px)]">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90">
          <Image
            src="/caudals_logo_black.svg"
            alt={t("logoAlt")}
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span className="text-xl font-medium tracking-tight text-[#141413]">
            {t("brand")}
          </span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map(({ href, labelKey }) => (
            <Link
              key={href}
              href={href}
              className="text-[14px] text-[#3b3a36] transition-colors hover:text-[#141413]"
            >
              {t(labelKey)}
            </Link>
          ))}
          <LanguageSwitcher />
          <Button size="sm" asChild className={cn("h-9", pillClass)}>
            <Link href={DIAGNOSTIC_CTA}>{t("diagnostic")}</Link>
          </Button>
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto text-[#141413] hover:bg-black/5 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">{t("toggleMenu")}</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="border-l border-black/[0.08] bg-background px-0 pb-0 pt-0 text-[#141413]"
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
                  <span className="text-lg font-medium text-[#141413]">{t("brand")}</span>
                </Link>
              </SheetHeader>

              <ScrollArea className="flex-1 px-6">
                <div className="flex flex-col gap-6 py-8">
                  {navLinks.map(({ href, labelKey }) => (
                    <SheetClose asChild key={href}>
                      <Link href={href} className="text-lg text-[#3b3a36] hover:text-[#141413]">
                        {t(labelKey)}
                      </Link>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <Button size="sm" asChild className={cn("h-10 w-full", pillClass)}>
                      <Link href={DIAGNOSTIC_CTA}>{t("diagnostic")}</Link>
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
