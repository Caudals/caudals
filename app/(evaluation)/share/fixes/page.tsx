import { Geist, Newsreader } from "next/font/google";
import { evalsPageMessages } from "@/components/evals/page-messages";
import { VendorFixListPage } from "@/components/evals/vendor-fix-list";
import { getMarketingSiteOrigin } from "@/lib/seo";

// The Paper type system (DESIGN.md §13) for this one public page of the app:
// Geist for text, Newsreader for the document excerpts.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal"], variable: "--font-newsreader", display: "swap", preload: false });

/**
 * A vendor's fix list (launch P-54): the fixes and their evidence an owner
 * sent from a report, in the Paper language. No shell: the vendor has no
 * account here. The token stays in the URL fragment.
 */
export default async function Page() {
  return (
    <div className={`${geist.variable} ${newsreader.variable}`}>
      {await evalsPageMessages(["share/fixes"])}
      <VendorFixListPage marketingOrigin={getMarketingSiteOrigin()} />
    </div>
  );
}
