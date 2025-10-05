import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

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
    default: "Collective | AI Dataset Crowdsourcing Platform",
    template: "%s | Collective",
  },
  description:
    "Build production-grade AI datasets at scale. Collective connects organizations with a global network of contributors to create rich, diverse datasets for machine learning.",
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
        {/* Enhanced multi-layer gradient background */}
        <div className="pointer-events-none fixed inset-0 -z-10 top-75">
          <div className="absolute left-1/2 top-10 h-[800px] w-[1600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/35 via-primary/20 to-transparent blur-3xl" />
          <div className="absolute left-0 top-1/3 h-[600px] w-[1200px] rounded-full bg-gradient-to-tr from-blue-500/30 via-cyan-500/15 to-transparent blur-3xl" />
          <div className="absolute right-0 top-1/3 h-[600px] w-[1200px] rounded-full bg-gradient-to-tl from-pink-500/30 via-purple-500/15 to-transparent blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-[400px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-t from-emerald-500/20 to-transparent blur-3xl" />
        </div>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
