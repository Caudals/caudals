import type { Metadata } from "next";
import { MobileShell } from "@/components/pwa/mobile-shell";
import { PwaServiceWorker } from "@/components/pwa/pwa-service-worker";

export const metadata: Metadata = {
  title: {
    default: "Caudals Companion",
    template: "%s | Caudals Companion",
  },
  description:
    "A mobile-first progressive web app that lets contributors browse dataset requests and upload samples anywhere.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Caudals Companion",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function PwaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MobileShell>
      <PwaServiceWorker />
      {children}
    </MobileShell>
  );
}
