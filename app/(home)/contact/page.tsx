import { ContactPageContent } from "@/components/contact/contact-page-content";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Contact Caudals",
  description:
    "Start a conversation with Caudals about dataset operations, pilot scope, and commercial fit.",
  pathname: "/contact",
});

export default function ContactPage() {
  return <ContactPageContent />;
}
