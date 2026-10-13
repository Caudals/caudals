import { requirePageIdentity } from "@/components/evals/page-identity";
import { HelpCentre } from "@/components/evals/help-pages";

/** Every help article, searchable (launch L-20). */
export default async function HelpCentrePage() {
  await requirePageIdentity("/workspace/help");
  return <HelpCentre />;
}
