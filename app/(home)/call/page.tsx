import { CallPageContent } from "@/components/call/call-page-content";
import { buildPublicMetadata } from "@/lib/seo";

// Public Cal.com event slug for the booking embed. Hardcoded so the page works
// in production without extra env setup; CALCOM_LINK (read at request time, no
// rebuild needed) overrides it if the event ever changes.
const DEFAULT_CAL_LINK = "caudals/call";

export const dynamic = "force-dynamic";

export const metadata = buildPublicMetadata({
  title: "Book a meeting | Caudals",
  description:
    "Schedule a 30-minute call with the Caudals data operations team to scope your dataset needs, feasibility, and timeline.",
  pathname: "/call",
});

export default function CallPage() {
  const calLink =
    (process.env.CALCOM_LINK ?? process.env.NEXT_PUBLIC_CALCOM_LINK)?.trim() ||
    DEFAULT_CAL_LINK;

  return <CallPageContent calLink={calLink} />;
}
