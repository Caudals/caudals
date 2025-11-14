import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth/provider";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";

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
  icons: {
    icon: [
      { url: "/caudals_logo_black.svg", type: "image/svg+xml" },
      { url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/caudals_logo_black.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AuthProvider>
          {children}
          <PwaInstallBanner />
          <Toaster richColors position="top-right" closeButton={false} />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
