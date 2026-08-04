import { LegalPage } from "@/components/legal/legal-page";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Política de cookies",
  description: "Cómo utiliza Caudals las cookies esenciales, las analíticas opcionales y otras tecnologías similares, y cómo puedes gestionar tus preferencias.",
  pathname: "/legal/cookies",
});

const sections = [
  {
    title: "Essential Cookies",
    body: "Required to run authentication, session management, language preferences, and core platform security behavior. These are always active and cannot be switched off.",
  },
  {
    title: "Analytics Cookies",
    body: "Optional, privacy-friendly analytics that help us understand product usage and improve the experience. They load only after you accept optional cookies in the cookie banner.",
  },
  {
    title: "Managing Your Choices",
    body: "You can accept or decline optional cookies in the banner, and change your choice at any time from the “Cookie preferences” link in the footer. You can also control cookies from your browser settings.",
  },
  {
    title: "Third-Party Services",
    body: "Some pages embed third-party services such as the Cal.com scheduler and payment providers, which may set their own cookies governed by their respective policies.",
  },
];

export default function CookiesPolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      description="Effective date: March 1, 2026. This policy describes how we use cookies and similar technologies."
      sections={sections}
    />
  );
}
