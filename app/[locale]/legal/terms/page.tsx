import {
  legalMetadata,
  legalStaticParams,
  renderLegalPage,
  type LegalRouteProps,
} from "@/components/legal/legal-route";

const DOCUMENT = "terms" as const;

export const generateStaticParams = legalStaticParams;

export function generateMetadata({ params }: LegalRouteProps) {
  return legalMetadata(DOCUMENT, params);
}

export default function Page({ params }: LegalRouteProps) {
  return renderLegalPage(DOCUMENT, params);
}
