"use client";

import Link from "next/link";
import {
  landingModePublicEnabled,
  landingModePublicNavigationLinks,
} from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

const legalLinks = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/cookies", label: "Cookie Policy" },
  { href: "/legal/notice", label: "Legal Notice" },
] as const;

const askAiLinks = [
  {
    name: "ChatGPT",
    href: "https://chatgpt.com/?q=What+is+Caudals%3F",
    bgClass: "bg-black text-white hover:bg-neutral-900",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.535-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615l-4.8351 2.7913a4.4944 4.4944 0 0 1-6.1451-1.6464zM2.3408 8.4956a4.485 4.485 0 0 1 2.3656-1.9728V12.16a.7665.7665 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7913A4.4944 4.4944 0 0 1 2.3408 8.4956zm16.0993 3.8558l-5.838-3.3685 2.0153-1.1639a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.682a.79.79 0 0 0-.4021-.6811zm2.0107-3.0231l-.1419-.0852-4.7735-2.7582a.7759.7759 0 0 0-.7854 0L9.009 9.8536V7.5212a.0757.0757 0 0 1 .0331-.0615l4.8351-2.7913a4.504 4.504 0 0 1 6.6802 4.6613zM8.3061 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.052V6.0647a4.504 4.504 0 0 1 7.3757-3.4537l-.1419.0805-4.7783 2.7581a.7948.7948 0 0 0-.3927.6813v6.7322zm1.0932-2.3656l2.6028-1.5 2.6075 1.5v3.0047l-2.6028 1.5-2.6075-1.5z" />
      </svg>
    ),
  },
  {
    name: "Claude",
    href: "https://claude.ai/new?q=What+is+Caudals%3F",
    bgClass: "bg-[#1b494b] text-[#4cc9c9] hover:bg-[#163f41]",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
      </svg>
    ),
  },
  {
    name: "Gemini",
    href: "https://gemini.google.com/app",
    bgClass: "bg-black text-white hover:bg-neutral-900",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="gemini-footer-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="35%" stopColor="#9B72CB" />
            <stop offset="70%" stopColor="#D96570" />
            <stop offset="100%" stopColor="#F49C46" />
          </linearGradient>
        </defs>
        <path
          d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
          fill="url(#gemini-footer-grad)"
        />
      </svg>
    ),
  },
  {
    name: "Perplexity",
    href: "https://www.perplexity.ai/search?q=What+is+Caudals%3F",
    bgClass: "bg-[#e06c55] text-white hover:bg-[#d85f47]",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .188a.75.75 0 0 1 .75.75v5.013l4.533-4.38.089-.072a.765.765 0 0 1 .735-.08.75.75 0 0 1 .459.69v4.87h1.675l.15.015a.75.75 0 0 1 .605.735v8.337a.75.75 0 0 1-.755.75h-1.675v4.887a.75.75 0 0 1-.468.693.765.765 0 0 1-.825-.165l-4.524-4.527v5.172a.75.75 0 0 1-1.5 0v-5.172l-4.527 4.528a.765.765 0 0 1-.822.165.75.75 0 0 1-.468-.695v-4.887H3.75a.75.75 0 0 1-.755-.75V7.822l.015-.15a.75.75 0 0 1 .74-.6h1.675V2.203l.009-.111a.75.75 0 0 1 .453-.58.765.765 0 0 1 .82.153l4.535 4.38V.938A.75.75 0 0 1 12 .188zm-5.06 13.717v5.976l4.305-4.308v-6.015zm5.815 1.67 4.307 4.306v-5.976l-4.305-4.346zm5.6-2.502a.75.75 0 0 1 .217.525v1.718h.918V8.572h-5.702zm-13.845 2.243h.92v-1.718c0-.197.078-.386.217-.525l4.55-4.596H4.51zm2.43-8.337h3.2v-3.79l-3.2 3.79zm6.92 0h3.2l-3.2-3.79z" />
      </svg>
    ),
  },
  {
    name: "Grok",
    href: "https://grok.com/?q=What+is+Caudals%3F",
    bgClass: "bg-black text-white hover:bg-neutral-900",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.25 12C2.25 6.615 6.615 2.25 12 2.25c4.78 0 8.765 3.44 9.585 8.005l-2.04.68C18.84 7.37 15.74 4.75 12 4.75c-4.004 0-7.25 3.246-7.25 7.25 0 2.26 1.037 4.28 2.66 5.61l-1.39 1.45A9.704 9.704 0 0 1 2.25 12zm11.34-7.8l-8.5 14.73 1.73 1 8.5-14.73-1.73-1zm.825 2.795l-1.73 1A7.227 7.227 0 0 1 19.25 12c0 4.004-3.246 7.25-7.25 7.25-1.95 0-3.73-.77-5.045-2.025l-1.465 1.38A9.704 9.704 0 0 0 12 21.75c5.385 0 9.75-4.365 9.75-9.75 0-3.32-1.655-6.25-4.185-8.015z" />
      </svg>
    ),
  },
];

interface MarketingFooterProps {
  forceLandingMode?: boolean;
}

export function MarketingFooter({ forceLandingMode = false }: MarketingFooterProps) {
  const t = useTranslations();
  
  // Only use simplified footer when deploy is in landing mode (set at build time)
  const isLandingMode = landingModePublicEnabled || forceLandingMode;

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-12">
        <div className={`grid gap-8 ${isLandingMode ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          <div>
            <p className="mb-4 text-lg font-semibold text-slate-900">
              {t("Caudals")}
            </p>
            <p className="text-sm text-slate-500">
              {t("Build production-grade datasets to train tailored AI models")}
            </p>
            <Link
              href="mailto:hello@caudals.com"
              className="mt-3 block text-sm font-medium text-slate-900 transition-colors hover:text-foreground"
            >
              hello@caudals.com
            </Link>
          </div>
          {isLandingMode ? (
            <>
              <div>
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  {t("Explore")}
                </p>
                <ul className="space-y-2 text-sm text-slate-500">
                  {landingModePublicNavigationLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="hover:text-foreground">
                        {t(link.label)}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/equipo" className="hover:text-foreground">
                      {t("Equipo")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/call" className="hover:text-foreground">
                      {t("Book a meeting")}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  {t("Legal")}
                </p>
                <ul className="space-y-2 text-sm text-slate-500">
                  {legalLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="hover:text-foreground">
                        {t(link.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  {t("Product")}
                </p>
                <ul className="space-y-2 text-sm text-slate-500">
                  <li>
                    <Link href="/contact" className="hover:text-foreground">
                      {t("Contact")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/pricing" className="hover:text-foreground">
                      {t("Pricing")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs" className="hover:text-foreground">
                      {t("Documentation")}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  {t("Company")}
                </p>
                <ul className="space-y-2 text-sm text-slate-500">
                  <li>
                    <Link href="/about" className="hover:text-foreground">
                      {t("About")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/blog" className="hover:text-foreground">
                      {t("Blog")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/careers" className="hover:text-foreground">
                      {t("Careers")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="hover:text-foreground">
                      {t("Contact")}
                    </Link>
                  </li>
                </ul>
              </div>
            </>
          )}
          {!isLandingMode ? (
            <div>
              <p className="mb-4 text-sm font-semibold text-slate-900">
                {t("Legal")}
              </p>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>
                  <Link href="/legal/privacy" className="hover:text-foreground">
                    {t("Privacy Policy")}
                  </Link>
                </li>
                <li>
                  <Link href="/legal/terms" className="hover:text-foreground">
                    {t("Terms of Service")}
                  </Link>
                </li>
                <li>
                  <Link href="/legal/cookies" className="hover:text-foreground">
                    {t("Cookie Policy")}
                  </Link>
                </li>
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-5 border-t border-border/60 py-8 text-center">
          <h3 className="text-xl font-bold tracking-tight text-slate-900">
            {t("Ask AI about Caudals")}
          </h3>
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            {askAiLinks.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex h-13 w-13 items-center justify-center rounded-2xl ${item.bgClass} shadow-xs transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95`}
              >
                <span className="sr-only">{item.name}</span>
                {item.icon}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 sm:flex-row">
          <p className="text-sm text-slate-500">
            {t("© {{year}} Caudals. All rights reserved.", {
              year: new Date().getFullYear(),
            })}
          </p>
          <div className="flex gap-6">
            <Link
              href="https://x.com/caudalshq"
              className="text-slate-500 transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="sr-only">{t("X")}</span>
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </Link>
            <Link
              href="https://github.com/Caudals"
              className="text-slate-500 transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="sr-only">{t("GitHub")}</span>
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <Link
              href="https://www.linkedin.com/company/caudals/"
              className="text-slate-500 transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="sr-only">{t("LinkedIn")}</span>
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
