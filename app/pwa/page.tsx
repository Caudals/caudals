import { PwaBrowseClient } from "@/components/pwa/pwa-browse-client";
import { getDatasets } from "@/lib/actions/dataset-actions";

export default async function PwaHomePage() {
  const datasets = await getDatasets();

  const heroStats = [
    {
      label: "Active briefs",
      value: datasets
        .filter((dataset) => dataset.status === "active")
        .length.toLocaleString(),
      meta: "Real-time availability",
    },
    {
      label: "Closing soon",
      value: datasets
        .filter((dataset) => dataset.status === "closing-soon")
        .length.toLocaleString(),
      meta: "Submit in < 72h",
    },
    {
      label: "Contributors online",
      value: datasets
        .reduce(
          (total, dataset) => total + dataset.activeContributors,
          0
        )
        .toLocaleString(),
      meta: "Global community",
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      <section className="grid gap-3 sm:grid-cols-3">
        {heroStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 px-4 py-3 text-white shadow-[0_12px_30px_rgba(8,15,40,0.4)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            <p className="text-xs text-white/60">{stat.meta}</p>
          </div>
        ))}
      </section>

      <PwaBrowseClient initialDatasets={datasets} />
    </div>
  );
}
