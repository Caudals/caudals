import {
  legalMetadata,
  renderLegalPage,
  type LegalRouteProps,
} from "@/components/legal/legal-route";

const DOCUMENT = "notice" as const;

// The owner's details are read at request time from LEGAL_ENTITY_* (launch
// decision I-1), so publishing them needs no rebuild.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: LegalRouteProps) {
  return legalMetadata(DOCUMENT, params);
}

export default function Page({ params }: LegalRouteProps) {
  return renderLegalPage(DOCUMENT, params);
}
