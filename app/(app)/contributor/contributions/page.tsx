import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import {
  getUserContributionsDetailed,
  getUserEarnings,
} from "@/lib/actions/contributor-actions";
import { ContributionsView } from "@/components/contributor/contributions/contributions-view";
import { Button } from "@/components/ui/button";
import { ArrowRight, Database } from "lucide-react";
import Link from "next/link";

export default async function ContributionsPage() {
  const contributionsResult = await getUserContributionsDetailed();
  const earnings = await getUserEarnings();

  const contributions =
    "error" in contributionsResult ? [] : contributionsResult.data || [];

  return (
    <div className="space-y-6">
      <ContributorPageHeader
        eyebrow="Work queue"
        title="My contributions"
        description="Track every submission, filter feedback states, and act on revisions quickly."
        actions={
          <>
            <Button asChild>
              <Link
                href="/contributor/browse"
                data-dashboard-action="contributor_contributions_browse_opportunities"
              >
                <Database className="mr-2 h-4 w-4" />
                Browse opportunities
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href="/contributor/earnings"
                data-dashboard-action="contributor_contributions_open_earnings"
              >
                Earnings
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />
      <ContributionsView contributions={contributions} earnings={earnings} />
    </div>
  );
}
