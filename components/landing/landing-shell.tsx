import type { ReactNode } from "react";
import "lenis/dist/lenis.css";
import "./landing.css";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { MomentumScroll } from "@/components/landing/momentum-scroll";

/**
 * The frame every Paper page shares: the scoped `.lp` palette, header, footer
 * and the landing's momentum scrolling. The home page, the demo and the sector
 * pages render their sections inside it.
 *
 * Not a client component (launch L-24b): the pages that use it render their
 * sections on the server and hydrate only the interactive parts (the header,
 * the hero chat, the animated figures, the demo). The 404 view, a client
 * component, renders it too.
 */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp min-h-screen">
      <Header />
      <main>{children}</main>
      <MarketingFooter />
      <MomentumScroll />
    </div>
  );
}
