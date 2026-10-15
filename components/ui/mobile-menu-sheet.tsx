"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useFrontDoor } from "@/components/public/front-door";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslations } from "@/lib/i18n/context";
import type { PublicNavigationLink } from "@/lib/navigation/public-links";
import { cn } from "@/lib/utils";

export type MobileMenuSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gives focus back to the menu button: the sheet has no Radix trigger of its own. */
  onClosed: () => void;
  links: readonly PublicNavigationLink[];
  cta: { href: string; label: string };
  pillClass: string;
};

/**
 * The public header's menu on small screens. A separate module that the
 * header loads on first use (`components/ui/mobile-menu.tsx`), so the dialog,
 * scroll area and their styles are not part of any page's first load
 * (launch L-24b).
 */
export function MobileMenuSheet({ open, onOpenChange, onClosed, links, cta, pillClass }: MobileMenuSheetProps) {
  const t = useTranslations("nav");
  const { demoPublic, signInUrl } = useFrontDoor();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="border-l border-black/[0.08] bg-background px-0 pb-0 pt-0 text-[#141413]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
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
              {links.map(({ href, labelKey }) => (
                <SheetClose asChild key={href}>
                  <Link href={href} className="text-lg text-[#3b3a36] hover:text-[#141413]">
                    {t(labelKey)}
                  </Link>
                </SheetClose>
              ))}
              {demoPublic ? (
                <SheetClose asChild>
                  <a href={signInUrl} className="text-lg text-[#3b3a36] hover:text-[#141413]">
                    {t("signIn")}
                  </a>
                </SheetClose>
              ) : null}
              <SheetClose asChild>
                <Button size="sm" asChild className={cn("h-10 w-full", pillClass)}>
                  <Link href={cta.href}>{cta.label}</Link>
                </Button>
              </SheetClose>
              <LanguageSwitcher className="pt-2 text-base" />
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
