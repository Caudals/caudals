import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import {
  getUserContributionsDetailed,
  getUserEarnings,
} from "@/lib/actions/contributor-actions";
import { ContributionsView } from "@/components/contributor/contributions/contributions-view";

export default async function ContributionsPage() {
  const contributionsResult = await getUserContributionsDetailed();
  const earnings = await getUserEarnings();

  const contributions =
    "error" in contributionsResult ? [] : contributionsResult.data || [];

  return (
    <>
      <ContributorPageHeader title="My Contributions" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <ContributionsView contributions={contributions} earnings={earnings} />
      </div>
    </>
  );
}
