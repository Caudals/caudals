import { BookPageContent } from "@/components/book/book-page-content";
import { buildPublicMetadata } from "@/lib/seo";

// Read the booking link at request time so it can be set as a Dokploy runtime
// env without rebuilding the image. CALCOM_LINK is the canonical name; the
// NEXT_PUBLIC_ fallback supports build-time configuration too.
export const dynamic = "force-dynamic";

export const metadata = buildPublicMetadata({
  title: "Book a meeting | Caudals",
  description:
    "Schedule a 30-minute call with the Caudals data operations team to scope your dataset needs, feasibility, and timeline.",
  pathname: "/book",
});

export default function BookPage() {
  const calLink =
    (process.env.CALCOM_LINK ?? process.env.NEXT_PUBLIC_CALCOM_LINK)?.trim() ||
    undefined;

  return <BookPageContent calLink={calLink} />;
}
