import { ClientMessages } from "@/components/i18n/client-messages";
import { LandingShell } from "@/components/landing/landing-shell";
import type { Locale } from "@/lib/i18n/config";
import { DemoPage } from "./demo-page";

/**
 * The free test in the landing's Paper frame. The frame renders on the
 * server; the demo itself is a client component and gets the `demo` messages
 * in its own language only (launch L-24b).
 */
export function DemoShell({ locale }: { locale: Locale }) {
  return (
    <LandingShell>
      <ClientMessages locale={locale} groups={["demo"]}>
        <DemoPage />
      </ClientMessages>
    </LandingShell>
  );
}
