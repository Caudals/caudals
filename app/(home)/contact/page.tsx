import type { Metadata } from "next";
import { ContactPageContent } from "@/components/contact/contact-page-content";

export const metadata: Metadata = {
  title: "Contact Caudals",
  description:
    "Start a conversation with Caudals about dataset operations, pilot scope, and commercial fit.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
