import type { Metadata } from "next";

import { CollaboratePageContent } from "@/components/collaborate/collaborate-page-content";

export const metadata: Metadata = {
  title: "Partnerships with Caudals",
  description:
    "Partner with Caudals to co-create responsible AI datasets, launch global programs, and unlock new collaboration models.",
};

export default function PartnershipsPage() {
  return <CollaboratePageContent />;
}
