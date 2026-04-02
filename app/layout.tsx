import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import { getServerTranslationBundle } from "@/lib/i18n/server";
import { TranslationProvider } from "@/lib/i18n/translation-context";
import { translateReactNode } from "@/lib/i18n/translate-node";
import { ClientLocaleDetector } from "@/lib/i18n/client-locale-detector";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  getDefaultSocialImageUrl,
  getMarketingSiteOrigin,
  SITE_NAME,
} from "@/lib/seo";

const googleVerificationToken =
  process.env.GOOGLE_SITE_VERIFICATION ??
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const defaultSocialImage = getDefaultSocialImageUrl();

export const metadata: Metadata = {
  metadataBase: new URL(getMarketingSiteOrigin()),
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_SITE_TITLE,
    template: "%s | Caudals",
  },
  description: DEFAULT_SITE_DESCRIPTION,
  keywords: [
    "AI datasets",
    "dataset operations",
    "data collection platform",
    "crowdsourcing",
    "machine learning data",
  ],
  openGraph: {
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: defaultSocialImage,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [defaultSocialImage],
  },
  ...(googleVerificationToken
    ? {
        verification: {
          google: googleVerificationToken,
        },
      }
    : {}),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: ["/favicon-32x32.png"],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/pwa-maskable-512.png",
        color: "#050914",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, dictionary, placeholders, translator } =
    await getServerTranslationBundle();

  const content = (
    <AuthProvider>
      {children}
      <PwaInstallBanner />
      <Toaster richColors position="top-right" closeButton={false} />
    </AuthProvider>
  );

  const localizedContent = translateReactNode(content, translator);

  return (
    <html lang={locale}>
      <body className="font-sans antialiased">
        <TranslationProvider
          locale={locale}
          dictionary={dictionary}
          placeholders={placeholders}
        >
          <ClientLocaleDetector serverLocale={locale} />
          {localizedContent}
        </TranslationProvider>
        {process.env.NODE_ENV === "production" && (
          <Script
            src="https://analytics.caudals.com/script.js"
            data-website-id="180a4b17-a999-474c-bf4b-bd3e96e5057f"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
