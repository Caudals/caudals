import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import { getServerTranslationBundle } from "@/lib/i18n/server";
import { TranslationProvider } from "@/lib/i18n/translation-context";
import { translateReactNode } from "@/lib/i18n/translate-node";
import { ClientLocaleDetector } from "@/lib/i18n/client-locale-detector";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Caudals | AI Dataset Crowdsourcing Platform",
    template: "%s | Caudals",
  },
  description:
    "Build production-grade AI datasets at scale. Caudals connects organizations with a global network of contributors to create rich, diverse datasets for machine learning.",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
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
            data-website-id="eefb45d8-154c-4671-890f-77a04f5c5e47"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
