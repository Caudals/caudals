import type { Metadata } from "next";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  getDefaultSocialImageUrl,
  getMarketingSiteOrigin,
  SITE_NAME,
  TWITTER_HANDLE,
} from "@/lib/seo";

const googleVerificationToken =
  process.env.GOOGLE_SITE_VERIFICATION ??
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const bingVerificationToken =
  process.env.BING_SITE_VERIFICATION ??
  process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;
const defaultSocialImage = getDefaultSocialImageUrl();

/**
 * Document-level metadata shared by every root layout.
 *
 * The app has one root layout per surface — `app/[locale]/layout.tsx` for the
 * public site and one per internal route group — so each can open `<html>` in
 * its own language. They all start from these defaults; the public layout and
 * each page then declare their locale-specific title, description and hreflang.
 */
export const rootMetadata: Metadata = {
  metadataBase: new URL(getMarketingSiteOrigin()),
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_SITE_DESCRIPTION,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  openGraph: {
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [{ url: defaultSocialImage, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
  },
  ...(googleVerificationToken || bingVerificationToken
    ? {
        verification: {
          ...(googleVerificationToken ? { google: googleVerificationToken } : {}),
          ...(bingVerificationToken
            ? { other: { "msvalidate.01": bingVerificationToken } }
            : {}),
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
        color: "#141413",
      },
    ],
  },
};
