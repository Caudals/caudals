"use client";

import Image from "next/image";
import { publicNavigationLinks } from "@/lib/navigation/public-links";
import { useTranslations } from "@/lib/i18n/context";
import { LocaleLink as Link } from "@/components/i18n/locale-link";

/** Ids match `footer.legalLinks.*` in the message files. */
const legalLinks = [
  { href: "/legal/privacy", id: "privacy" },
  { href: "/legal/terms", id: "terms" },
  { href: "/legal/cookies", id: "cookies" },
  { href: "/legal/notice", id: "notice" },
] as const;

const getAskAiLinks = (prompt: string) => {
  const encodedPrompt = encodeURIComponent(prompt);
  return [
    {
      name: "ChatGPT",
      href: `https://chatgpt.com/?q=${encodedPrompt}`,
      icon: "/icons/ai/chatgpt.svg",
      bgClass: "bg-neutral-900",
    },
    {
      name: "Claude",
      href: `https://claude.ai/new?q=${encodedPrompt}`,
      icon: "/icons/ai/claude.svg",
      bgClass: "bg-[#e58a75]",
    },
    {
      name: "Gemini",
      href: `https://www.google.com/search?udm=50&aep=11&atvm=2&q=${encodedPrompt}`,
      icon: "/icons/ai/gemini.svg",
      bgClass: "bg-neutral-900",
    },
    {
      name: "Perplexity",
      href: `https://www.perplexity.ai/search?q=${encodedPrompt}`,
      icon: "/icons/ai/perplexity.svg",
      bgClass: "bg-[#214346]",
    },
    {
      name: "Grok",
      href: `https://grok.com/?q=${encodedPrompt}`,
      icon: "/icons/ai/grok.svg",
      bgClass: "bg-neutral-900",
    },
  ];
};

const socialLinks = [
  {
    href: "https://x.com/caudalshq",
    labelKey: "x",
    evenOdd: false,
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    href: "https://github.com/Caudals",
    labelKey: "github",
    evenOdd: true,
    path: "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
  },
  {
    href: "https://www.linkedin.com/company/caudals/",
    labelKey: "linkedin",
    evenOdd: false,
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
] as const;

export function MarketingFooter() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");

  const aiPrompt = t("askAiPrompt");
  const aiLinks = getAskAiLinks(aiPrompt);

  return (
    <footer className="font-mk-sans border-t border-[#e9e7e1] bg-background text-[#141413]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-[clamp(16px,4vw,40px)] pb-10 pt-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,3fr)]">
          <div className="max-w-sm">
            <Link href="/" aria-label={tNav("brand")} className="inline-flex transition-opacity hover:opacity-80">
              <Image src="/caudals_logo_black.svg" alt={tNav("logoAlt")} width={28} height={28} className="h-7 w-7" />
            </Link>
            <p className="mt-5 text-sm leading-relaxed text-[#6b6a63]">{t("tagline")}</p>
            <Link
              href="mailto:hello@caudals.com"
              className="mt-3 inline-block text-sm font-medium text-[#141413] underline decoration-[#dcdad3] underline-offset-4 transition-colors hover:decoration-[#141413]"
            >
              hello@caudals.com
            </Link>
          </div>
          <div>
            <p className="mb-4 text-sm font-medium text-[#141413]">
              {t("explore")}
            </p>
            <ul className="space-y-2.5 text-sm text-[#3b3a36]">
              {[{ href: "/#how-it-works", labelKey: "howItWorks" } as const, ...publicNavigationLinks].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-[#141413]">
                    {tNav(link.labelKey)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/call" className="transition-colors hover:text-[#141413]">
                  {t("bookMeeting")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-medium text-[#141413]">
              {t("legalHeading")}
            </p>
            <ul className="space-y-2.5 text-sm text-[#3b3a36]">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-[#141413]">
                    {t(`legalLinks.${link.id}.label`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-[#141413]">{t("askAi")}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {aiLinks.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex h-[46px] w-[46px] items-center justify-center rounded-[14px] transition-transform duration-200 hover:scale-105 active:scale-95 ${item.bgClass}`}
                title={`${t("askAi")} · ${item.name}`}
              >
                <span className="sr-only">{item.name}</span>
                <Image src={item.icon} alt="" width={26} height={26} />
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#e9e7e1] pt-8 sm:flex-row">
          <p className="text-sm text-[#6b6a63]">{t("rights", { year: new Date().getFullYear() })}</p>
          <div className="flex gap-6">
            {socialLinks.map((social) => (
              <Link
                key={social.href}
                href={social.href}
                className="text-[#6b6a63] transition-colors hover:text-[#141413]"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="sr-only">{t(social.labelKey)}</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={social.path} {...(social.evenOdd ? ({ fillRule: "evenodd", clipRule: "evenodd" } as const) : {})} />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
