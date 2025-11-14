import { getUserSubmissions } from "@/lib/actions/submission-actions";
import { PwaSubmissionsClient } from "@/components/pwa/pwa-submissions-client";

export default async function PwaSubmissionsPage() {
  const submissions = await getUserSubmissions();

  return (
    <div className="space-y-5 pb-16">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-[0_12px_30px_rgba(8,15,40,0.45)]">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Sync status
        </p>
        <h2 className="mt-1 text-2xl font-semibold">Your uploads timeline</h2>
        <p className="text-sm text-white/70">
          Track approvals, notes from reviewers, and rewards from anywhere.
        </p>
      </section>

      <PwaSubmissionsClient initialSubmissions={submissions} />
    </div>
  );
}
