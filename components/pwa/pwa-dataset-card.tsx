import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContributeDialog } from "@/components/browse/contribute-dialog";
import { Dataset } from "@/types/dataset";
import { categoryLabels, dataTypeLabels } from "@/lib/data/datasets";
import { CalendarDays, Trophy } from "lucide-react";

interface PwaDatasetCardProps {
  dataset: Dataset;
}

export function PwaDatasetCard({ dataset }: PwaDatasetCardProps) {
  const completion =
    dataset.samplesNeeded > 0
      ? Math.min(
          Math.round((dataset.samplesCollected / dataset.samplesNeeded) * 100),
          100
        )
      : 0;

  const rewardLabel = `${dataset.currency} ${dataset.rewardAmount.toFixed(2)}`;
  const deadlineLabel = new Date(dataset.deadline).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" }
  );

  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-4 text-white shadow-[0_20px_45px_rgba(2,6,23,0.4)] backdrop-blur">
      <Link
        href={`/pwa/datasets/${dataset.id}`}
        className="block overflow-hidden rounded-2xl border border-white/10"
      >
        <div className="relative h-48 w-full">
          <Image
            src={dataset.imageUrl}
            alt={dataset.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
            priority={false}
          />
          <div className="absolute left-4 top-4 flex gap-2">
            <Badge className="border-white/40 bg-black/30 text-[11px] uppercase tracking-wide">
              {categoryLabels[dataset.category]}
            </Badge>
            {dataset.featured && (
              <Badge variant="outline" className="bg-white/20 text-[11px]">
                Featured
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-3 space-y-1 px-0.5">
          <h3 className="text-lg font-semibold leading-tight">
            {dataset.title}
          </h3>
          <p className="text-sm text-white/70 line-clamp-2">
            {dataset.description}
          </p>
        </div>
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-white/50">
            Reward
          </p>
          <p className="flex items-center gap-1 font-semibold">
            <Trophy className="h-4 w-4 text-amber-300" />
            {rewardLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-white/50">
            Deadline
          </p>
          <p className="flex items-center gap-1 font-semibold">
            <CalendarDays className="h-4 w-4 text-sky-300" />
            {deadlineLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60">
          <span>
            {dataset.samplesCollected}/{dataset.samplesNeeded} samples
          </span>
          <span>{completion}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{ width: `${completion}%` }}
          />
        </div>
        <div className="text-xs text-white/60">
          {dataTypeLabels[dataset.dataType]} •{" "}
          {dataset.activeContributors.toLocaleString()} contributors
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/pwa/datasets/${dataset.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Read Brief
        </Link>
        <ContributeDialog
          datasetId={dataset.id}
          datasetTitle={dataset.title}
          dataType={dataset.dataType}
        >
          <Button className="flex-1 rounded-2xl bg-white text-slate-900 hover:bg-white/90">
            Upload Sample
          </Button>
        </ContributeDialog>
      </div>
    </article>
  );
}
