import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth/provider";

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
    icon: "/caudals_logo_white.svg",
    shortcut: "/caudals_logo_white.svg",
    apple: "/caudals_logo_white.svg",
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
          <Toaster richColors position="top-right" closeButton={false} />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
