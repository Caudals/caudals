import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = buildNoIndexMetadata(
  "Caudals auth",
  "Authentication and account access routes for Caudals."
);

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
        {children}
    </>
  );
}
