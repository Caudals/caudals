import { SharedReport } from "@/components/evals/report-view";

/** A customer-shared report. No shell: the recipient has no account here. */
export default function Page() {
  return (
    <div className="p-root" lang="en">
      <main id="p-main" className="eval-shared">
        <SharedReport />
      </main>
    </div>
  );
}
