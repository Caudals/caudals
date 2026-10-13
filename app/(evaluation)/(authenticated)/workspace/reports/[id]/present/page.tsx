import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { ReportReadout } from "@/components/evals/readout/readout-present";
import { readoutMode } from "@/lib/evals/readout/flags";

/**
 * Readout mode for a report revision (launch L-35, spec P-57). The flag is
 * read at request time; the API checks the person's role again.
 */
export default async function ReportPresentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/reports");
  const mode = readoutMode();
  if (mode === "off") notFound();
  return <ReportReadout reportId={(await params).id} mode={mode} />;
}
