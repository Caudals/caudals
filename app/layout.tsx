import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Dataset Crowdsource",
    template: "%s | Dataset Crowdsource",
  },
  description:
    "Crowdsource rich, real-world datasets with a platform built for requesters, contributors, and admins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 bg-oa-radial" />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
