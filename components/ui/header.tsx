"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "@/components/ui/mobile-menu";
import { cn } from "@/lib/utils";
import {
  publicNavigationLinks,
  type PublicNavigationLink,
} from "@/lib/navigation/public-links";
import { useTranslations } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useFrontDoor } from "@/components/public/front-door";

interface HeaderProps {
  links?: readonly PublicNavigationLink[];
}

/** The free diagnostic, preselected on the contact form. */
const DIAGNOSTIC_CTA = "/contact?offer=reality-check";
/** The free test (launch L-04), once `DEMO_PUBLIC` makes it the front door. */
const DEMO_CTA = "/demo";

const pillClass =
  "rounded-full bg-[#141413] px-4 text-[13px] font-medium text-[#fafaf8] transition-[opacity,transform] duration-200 hover:bg-[#141413] hover:opacity-85 active:scale-[0.97]";

export function Header({ links }: HeaderProps) {
  const t = useTranslations("nav");
  const { demoPublic, signInUrl } = useFrontDoor();
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
  const cta = demoPublic ? { href: DEMO_CTA, label: t("tryFree") } : { href: DIAGNOSTIC_CTA, label: t("diagnostic") };

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
          {demoPublic ? (
            <a href={signInUrl} className="text-[14px] text-[#3b3a36] transition-colors hover:text-[#141413]">
              {t("signIn")}
            </a>
          ) : null}
          <Button size="sm" asChild className={cn("h-9", pillClass)}>
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </nav>
        {/* On a phone the free test stays one tap away, outside the menu. */}
        {demoPublic ? (
          <Button size="sm" asChild className={cn("ml-auto h-8 px-3.5 md:hidden", pillClass)}>
            <Link href={DEMO_CTA}>{t("tryFree")}</Link>
          </Button>
        ) : null}
        <MobileMenu
          className={cn("text-[#141413] hover:bg-black/5 md:hidden", demoPublic ? "-ml-5" : "ml-auto")}
          label={t("toggleMenu")}
          links={navLinks}
          cta={cta}
          pillClass={pillClass}
        />
      </div>
    </header>
  );
}
