"use client";

import Image from "next/image";
import Link from "next/link";

import { Dataset } from "@/types/dataset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Target,
  Timer,
} from "lucide-react";

import { ContributeDialog } from "@/components/browse/contribute-dialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/use-translations";

interface Submission {
  id: string;
  created_at: string;
  status: string;
  profiles?: {
    full_name: string;
  };
}

interface DatasetDetailClientProps {
  dataset: Dataset;
  submissions: Submission[];
}

const statusStyles: Record<Dataset["status"], string> = {
  active: "border-emerald-500/25 bg-emerald-500/15 text-emerald-700",
  "closing-soon": "border-amber-500/25 bg-amber-500/15 text-amber-700",
  completed: "border-sky-500/25 bg-sky-500/15 text-sky-700",
  paused: "border-zinc-500/25 bg-zinc-500/10 text-zinc-600",
};

const submissionEffortLabels: Record<Dataset["dataType"], string> = {
  image: "~8 minutes per submission",
  video: "~18 minutes per submission",
  audio: "~12 minutes per submission",
  text: "~5 minutes per submission",
  mixed: "~20 minutes per submission",
};

const submissionStatusLabels: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  pending: "Pending",
};

export function DatasetDetailClient({
  dataset,
  submissions,
}: DatasetDetailClientProps) {
  const t = useTranslations();
  const progressRaw =
    dataset.samplesNeeded > 0
      ? (dataset.samplesCollected / dataset.samplesNeeded) * 100
      : 0;
  const progressValue = Math.min(Math.round(progressRaw), 100);

  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const isExpired = daysUntilDeadline <= 0;
  const isCompleted = dataset.status === "completed";
  const isPaused = dataset.status === "paused";

  const deadlineLabel = isExpired
    ? t("Deadline passed")
    : daysUntilDeadline === 1
      ? t("1 day remaining")
      : t("{{count}} days remaining", { count: daysUntilDeadline });

  const dateDisplayOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  } as const;

  const postedLabel = new Date(dataset.datePosted).toLocaleDateString(
    "es-ES",
    dateDisplayOptions,
  );

  const deadlineDateLabel = new Date(dataset.deadline).toLocaleDateString(
    "es-ES",
    dateDisplayOptions,
  );

  const rewardLabel = `${dataset.currency} ${dataset.rewardAmount.toFixed(2)}`;

  const submissionEffort = submissionEffortLabels[dataset.dataType]
    ? t(submissionEffortLabels[dataset.dataType])
    : t("~10 minutes per submission");

  const recentSubmissions = submissions.slice(0, 5);

  return (
    <div className="bg-slate-50/30 min-h-screen">
      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <Link
          href="/browse"
          className="mb-8 inline-flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("Back to browse")}
        </Link>

        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:items-start">
          <section className="space-y-10">
            {/* Header Content - Flowing naturally, no card */}
            <div className="space-y-6">
              {/* Image */}
              <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                <Image
                  src={dataset.imageUrl}
                  alt={dataset.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 800px"
                  className="object-cover"
                  priority
                />
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Badge
                  className={cn("text-[11px] font-medium tracking-wide shadow-none border-0 px-2 py-0.5", 
                  dataset.status === "active" ? "bg-emerald-50 text-emerald-700" : 
                  dataset.status === "closing-soon" ? "bg-amber-50 text-amber-700" :
                  dataset.status === "completed" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                  )}
                >
                  {statusLabels[dataset.status]
                    ? t(statusLabels[dataset.status])
                    : dataset.status}
                </Badge>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  {categoryLabels[dataset.category]
                    ? t(categoryLabels[dataset.category])
                    : dataset.category}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  {dataTypeLabels[dataset.dataType]
                    ? t(dataTypeLabels[dataset.dataType])
                    : dataset.dataType}
                </span>
              </div>

              {/* Title and Organization */}
              <div className="space-y-5">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {dataset.title}
                </h1>

                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-slate-200 shadow-sm">
                    {dataset.organization.avatar ? (
                      <AvatarImage src={dataset.organization.avatar} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-xs bg-slate-100 text-slate-600 font-medium">
                      {dataset.organization.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {dataset.organization.name}
                      {dataset.organization.verified && (
                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {t("Posted")} {postedLabel}
                    </p>
                  </div>
                </div>

                <div className="prose prose-slate max-w-none text-slate-600">
                  <p className="text-base leading-relaxed">
                    {dataset.description}
                  </p>
                </div>
              </div>
            </div>

            <Separator className="bg-slate-200" />

            {/* Requirements & Criteria - Document style */}
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" /> 
                  {t("Quality Criteria")}
                </h2>
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <ul className="space-y-3">
                    {dataset.qualityCriteria.map((criterion, index) => (
                      <li key={index} className="flex items-start gap-3 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span className="leading-relaxed">{criterion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" /> 
                  {t("Requirements")}
                </h2>
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  {dataset.requirements.length > 0 ? (
                    <ul className="space-y-3">
                      {dataset.requirements.map((requirement, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-3 text-sm text-slate-700"
                        >
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                          <span className="leading-relaxed">{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      {t("No additional requirements")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Submissions */}
            {recentSubmissions.length > 0 && (
              <div className="pt-4">
                <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="h-5 w-5 text-indigo-600" /> 
                  {t("Recent Activity")}
                </h2>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="divide-y divide-slate-100">
                    {recentSubmissions.map((submission) => (
                      <div
                        key={submission.id}
                        className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-slate-200">
                            <AvatarFallback className="text-xs bg-slate-100 text-slate-600">
                              {submission.profiles?.full_name
                                ?.substring(0, 2)
                                .toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {submission.profiles?.full_name || t("Anonymous")}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(submission.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "text-[10px] font-medium shadow-none border-0 px-2 py-0.5",
                            submission.status === "approved"
                              ? "bg-emerald-50 text-emerald-700"
                              : submission.status === "rejected"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-100 text-slate-700"
                          )}
                        >
                          {submissionStatusLabels[submission.status]
                            ? t(submissionStatusLabels[submission.status])
                            : submission.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-24">
            {/* CTA Card */}
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900">{t("Contribute")}</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {t("Earn rewards for approved submissions")}
                </p>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4 text-sm">
                  <div className="flex items-start gap-3 text-slate-600">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span className="leading-snug">{t("Quality validation required")}</span>
                  </div>
                  <div className="flex items-start gap-3 text-slate-600">
                    <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                        {t("Data type")}
                      </p>
                      <p className="font-medium text-slate-900">
                        {dataTypeLabels[dataset.dataType]
                          ? t(dataTypeLabels[dataset.dataType])
                          : dataset.dataType}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-slate-600">
                    <Calendar className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                        {t("Deadline")}
                      </p>
                      <p className="font-medium text-slate-900">
                        {deadlineDateLabel}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-0.5",
                          isExpired ? "text-red-600 font-medium" : "text-slate-500"
                        )}
                      >
                        {deadlineLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-slate-600">
                    <Timer className="h-5 w-5 text-indigo-500 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                        {t("Estimated effort")}
                      </p>
                      <p className="font-medium text-slate-900">
                        {submissionEffort}
                      </p>
                    </div>
                  </div>
                </div>

                {isCompleted ? (
                  <Button className="w-full bg-slate-100 text-slate-500 hover:bg-slate-100 cursor-not-allowed shadow-none" disabled>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> {t("Completed")}
                  </Button>
                ) : isPaused || isExpired ? (
                  <Button className="w-full bg-slate-100 text-slate-500 hover:bg-slate-100 cursor-not-allowed shadow-none" disabled>
                    {isPaused ? t("Paused") : t("Closed")}
                  </Button>
                ) : (
                  <ContributeDialog
                    datasetId={dataset.id}
                    datasetTitle={dataset.title}
                    dataType={dataset.dataType}
                  >
                    <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all h-11 rounded-xl font-medium">
                      {t("Start Contributing")}
                    </Button>
                  </ContributeDialog>
                )}
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900">{t("Statistics")}</h3>
              </div>
              <CardContent className="p-6 space-y-6 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">{t("Progress")}</span>
                    <span className="font-semibold text-slate-900">
                      {dataset.samplesCollected.toLocaleString()} /{" "}
                      {dataset.samplesNeeded.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={progressValue} className="h-2.5 bg-slate-100 [&>div]:bg-emerald-500" />
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>
                      {progressValue}
                      {t("% complete")}
                    </span>
                    <span className={cn(isExpired ? "text-red-600" : "text-emerald-600")}>
                      {isExpired
                        ? t("Closed")
                        : daysUntilDeadline <= 7
                          ? t("Closing soon")
                          : t("Open")}
                    </span>
                  </div>
                </div>
                
                <Separator className="bg-slate-100" />
                
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t("Samples needed")}</span>
                    <span className="font-semibold text-slate-900">
                      {dataset.samplesNeeded.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t("Collected")}</span>
                    <span className="font-semibold text-slate-900">
                      {dataset.samplesCollected.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t("Reward/item")}</span>
                    <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      {rewardLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t("Time remaining")}</span>
                    <span
                      className={cn(
                        "font-semibold",
                        isExpired ? "text-red-600" : "text-slate-900"
                      )}
                    >
                      {deadlineLabel}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
