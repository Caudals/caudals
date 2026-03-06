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
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-10">
      <Link
        href="/browse"
        className="mb-6 inline-flex items-center text-sm text-slate-500 transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> {t("Back to browse")}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px] lg:items-start">
        <section className="space-y-6">
          {/* Main Info Card */}
          <Card className="overflow-hidden rounded-xl border border-border py-0 gap-0">
            <CardContent className="space-y-8 p-6">
              {/* Image */}
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border bg-muted">
                <Image
                  src={dataset.imageUrl}
                  alt={dataset.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover"
                  priority
                />
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-xs", statusStyles[dataset.status])}
                >
                  {statusLabels[dataset.status]
                    ? t(statusLabels[dataset.status])
                    : dataset.status}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {categoryLabels[dataset.category]
                    ? t(categoryLabels[dataset.category])
                    : dataset.category}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {dataTypeLabels[dataset.dataType]
                    ? t(dataTypeLabels[dataset.dataType])
                    : dataset.dataType}
                </Badge>
              </div>

              {/* Title and Organization */}
              <div className="space-y-4">
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                  {dataset.title}
                </h1>

                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {dataset.organization.avatar ? (
                      <AvatarImage src={dataset.organization.avatar} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {dataset.organization.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      {dataset.organization.name}
                      {dataset.organization.verified && (
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {t("Posted")} {postedLabel}
                    </p>
                  </div>
                </div>

                <p className="text-slate-500 leading-relaxed">
                  {dataset.description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quality Criteria */}
          <Card className="rounded-xl border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" /> {t("Quality Criteria")}
              </CardTitle>
              <CardDescription>
                {t("Requirements for submission approval")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {dataset.qualityCriteria.map((criterion, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span className="text-slate-500">{criterion}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Requirements */}
          <Card className="rounded-xl border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" /> {t("Requirements")}
              </CardTitle>
              <CardDescription>
                {t("What you need before contributing")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dataset.requirements.length > 0 ? (
                <ul className="space-y-2">
                  {dataset.requirements.map((requirement, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-slate-500"
                    >
                      <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-foreground" />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  No additional requirements
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          {recentSubmissions.length > 0 && (
            <Card className="rounded-xl border border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5" /> {t("Recent Activity")}
                </CardTitle>
                <CardDescription>
                  {t("Latest contributions to this request")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {submission.profiles?.full_name
                            ?.substring(0, 2)
                            .toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {submission.profiles?.full_name || t("Anonymous")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    </div>
                    <Badge
                      variant={
                        submission.status === "approved"
                          ? "default"
                          : submission.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {submissionStatusLabels[submission.status]
                        ? t(submissionStatusLabels[submission.status])
                        : submission.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
          {/* CTA Card */}
          <Card className="rounded-xl border border-border">
            <CardHeader>
              <CardTitle className="text-lg">{t("Contribute")}</CardTitle>
              <CardDescription>
                {t("Earn rewards for approved submissions")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{t("Quality validation required")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {t("Data type")}
                    </p>
                    <p className="font-medium text-foreground">
                      {dataTypeLabels[dataset.dataType]
                        ? t(dataTypeLabels[dataset.dataType])
                        : dataset.dataType}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {t("Deadline")}
                    </p>
                    <p className="font-medium text-foreground">
                      {deadlineDateLabel}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        isExpired ? "text-red-600" : "text-slate-500"
                      )}
                    >
                      {deadlineLabel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Timer className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {t("Estimated effort")}
                    </p>
                    <p className="font-medium text-foreground">
                      {submissionEffort}
                    </p>
                  </div>
                </div>
              </div>

              {isCompleted ? (
                <Button className="w-full" disabled>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> {t("Completed")}
                </Button>
              ) : isPaused || isExpired ? (
                <Button className="w-full" disabled>
                  {isPaused ? t("Paused") : t("Closed")}
                </Button>
              ) : (
                <ContributeDialog
                  datasetId={dataset.id}
                  datasetTitle={dataset.title}
                  dataType={dataset.dataType}
                >
                  <Button className="w-full">{t("Start Contributing")}</Button>
                </ContributeDialog>
              )}
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card className="rounded-xl border border-border">
            <CardHeader>
              <CardTitle className="text-lg">{t("Statistics")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{t("Progress")}</span>
                  <span className="font-medium text-foreground">
                    {dataset.samplesCollected.toLocaleString()} /{" "}
                    {dataset.samplesNeeded.toLocaleString()}
                  </span>
                </div>
                <Progress value={progressValue} className="h-2" />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {progressValue}
                    {t("% complete")}
                  </span>
                  <span>
                    {isExpired
                      ? t("Closed")
                      : daysUntilDeadline <= 7
                        ? t("Closing soon")
                        : t("Open")}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {t("Samples needed")}
                  </span>
                  <span className="font-semibold">
                    {dataset.samplesNeeded.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {t("Collected")}
                  </span>
                  <span className="font-semibold">
                    {dataset.samplesCollected.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {t("Reward/item")}
                  </span>
                  <span className="font-semibold">{rewardLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {t("Time remaining")}
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      isExpired ? "text-red-600" : ""
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
  );
}
