import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { SiteAnalytics } from "@/components/legal/site-analytics";
import { defaultLocale, localeHtmlLang } from "@/lib/i18n/config";
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

/**
 * Document-level defaults. Locale-specific title, description and hreflang are
 * declared by `app/[locale]/layout.tsx` and by each page, which override these.
 */
export const metadata: Metadata = {
  metadataBase: new URL(getMarketingSiteOrigin()),
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_SITE_TITLE,
    template: "%s | Caudals",
  },
  description: DEFAULT_SITE_DESCRIPTION,
  creator: SITE_NAME,
  publisher: SITE_NAME,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The document opens in the default language. `app/[locale]/layout.tsx`
  // corrects `<html lang>` for the public tree, which is the only part of the
  // site that is translated; the internal surfaces are English-only.
  //
  // This layout deliberately reads nothing from the request: doing so would
  // opt every route out of static rendering, including the marketing pages.
  return (
    <html lang={localeHtmlLang[defaultLocale]} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" closeButton={false} />
        </AuthProvider>
        <SiteAnalytics />
      </body>
    </html>
  );
}
