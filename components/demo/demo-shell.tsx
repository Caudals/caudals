"use client";

import { LandingShell } from "@/components/landing/landing-shell";
import { DemoPage } from "./demo-page";

export function DemoShell() {
  return (
    <LandingShell>
      <DemoPage />
    </LandingShell>
  );
}
