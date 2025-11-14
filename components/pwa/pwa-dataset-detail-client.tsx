"use client";

import Image from "next/image";
import Link from "next/link";
import { Dataset } from "@/types/dataset";
import { Badge } from "@/components/ui/badge";
import { ContributeDialog } from "@/components/browse/contribute-dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Sparkles,
  Users,
  ShieldCheck,
  ListChecks,
  TimerReset,
} from "lucide-react";
import { dataTypeLabels, statusLabels } from "@/lib/data/datasets";

interface Submission {
  id: string;
  created_at: string;
  status: string;
  profiles?: {
    full_name: string;
  };
}

interface PwaDatasetDetailClientProps {
  dataset: Dataset;
  submissions: Submission[];
}

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const statusAccent: Record<Dataset["status"], BadgeVariant> = {
  active: "default",
  "closing-soon": "secondary",
  completed: "outline",
  paused: "outline",
};

export function PwaDatasetDetailClient({
  dataset,
  submissions,
}: PwaDatasetDetailClientProps) {
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
    {
      month: "long",
      day: "numeric",
    }
  );

  const recentSubmissions = submissions.slice(0, 4);

  return (
    <div className="space-y-5 pb-16 text-white">
      <Link
        href="/pwa"
        className="inline-flex items-center gap-2 text-sm text-white/70"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to briefs
      </Link>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="relative h-60 w-full">
          <Image
            src={dataset.imageUrl}
            alt={dataset.title}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
            <Badge variant={statusAccent[dataset.status]}>
              {statusLabels[dataset.status]}
            </Badge>
            <h2 className="mt-2 text-2xl font-semibold">{dataset.title}</h2>
            <p className="text-sm text-white/75 line-clamp-2">
              {dataset.description}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/15 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                Reward
              </p>
              <p className="text-xl font-semibold">{rewardLabel}</p>
              <p className="text-xs text-white/60">Per approved submission</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                Deadline
              </p>
              <p className="text-xl font-semibold">{deadlineLabel}</p>
              <p className="text-xs text-white/60">Local timezone</p>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              {dataTypeLabels[dataset.dataType]}
            </div>
            <p className="mt-1 text-sm text-white/70">
              {dataset.activeContributors.toLocaleString()} contributors active
              • {dataset.samplesCollected}/{dataset.samplesNeeded} samples
              verified
            </p>
            <div className="mt-3 h-2 w-full rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-sky-300" />
          <h3 className="text-lg font-semibold">Quality checklist</h3>
        </div>
        <ul className="space-y-2 text-sm text-white/80">
          {dataset.qualityCriteria.map((criterion) => (
            <li key={criterion} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
              {criterion}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-amber-200" />
          <h3 className="text-lg font-semibold">Requirements</h3>
        </div>
        {dataset.requirements.length > 0 ? (
          <ul className="space-y-2 text-sm text-white/80">
            {dataset.requirements.map((requirement) => (
              <li key={requirement} className="flex items-start gap-2">
                <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-white/60" />
                {requirement}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">
            No specific requirements were provided for this brief.
          </p>
        )}
      </div>

      {recentSubmissions.length > 0 && (
        <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2">
            <TimerReset className="h-5 w-5 text-slate-200" />
            <h3 className="text-lg font-semibold">Recent activity</h3>
          </div>
          <ul className="space-y-2 text-sm text-white/80">
            {recentSubmissions.map((submission) => (
              <li
                key={submission.id}
                className="flex items-center justify-between rounded-2xl border border-white/15 bg-black/10 px-4 py-2"
              >
                <div>
                  <p className="font-semibold">
                    {submission.profiles?.full_name || "Anonymous"}
                  </p>
                  <p className="text-xs text-white/60">
                    {new Date(submission.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className="border-white/30">
                  {submission.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-28 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 p-5">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">
              Upload center
            </p>
            <p className="text-lg font-semibold">
              Submit your sample for review
            </p>
            <p className="text-sm text-white/70">
              Files are encrypted in transit and linked to your contributor ID.
            </p>
          </div>
          <ContributeDialog
            datasetId={dataset.id}
            datasetTitle={dataset.title}
            dataType={dataset.dataType}
          >
            <Button className="w-full rounded-2xl bg-white text-slate-900 hover:bg-white/90">
              Upload to this brief
            </Button>
          </ContributeDialog>
        </div>
      </div>
    </div>
  );
}
