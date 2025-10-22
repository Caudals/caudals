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
  Clock,
  DollarSign,
  FileText,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { ContributeDialog } from "@/components/browse/contribute-dialog";
import { cn } from "@/lib/utils";

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

export function DatasetDetailClient({
  dataset,
  submissions,
}: DatasetDetailClientProps) {
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
  const isActive = dataset.status === "active";
  const isTrending = isActive && dataset.activeContributors >= 40;

  const deadlineLabel = isExpired
    ? "Deadline passed"
    : `${daysUntilDeadline} day${daysUntilDeadline === 1 ? "" : "s"} remaining`;

  const postedLabel = new Date(dataset.datePosted).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const rewardLabel = `${dataset.currency} ${dataset.rewardAmount.toFixed(2)}`;

  const recentSubmissions = submissions.slice(0, 5);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <Link
        href="/browse"
        className="mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to browse
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="space-y-8">
          <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
              <div className="space-y-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted/40">
                  <Image
                    src={dataset.imageUrl}
                    alt={`Cover image for ${dataset.title}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 420px"
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border bg-background/80 backdrop-blur",
                      statusStyles[dataset.status]
                    )}
                  >
                    {statusLabels[dataset.status]}
                  </Badge>
                  <Badge variant="outline" className="border-border/60 bg-background/80">
                    {categoryLabels[dataset.category]}
                  </Badge>
                  <Badge variant="secondary" className="border border-border/40">
                    📁 {dataTypeLabels[dataset.dataType]}
                  </Badge>
                  {isTrending && (
                    <Badge className="flex items-center gap-1 bg-emerald-500/90 text-white">
                      <TrendingUp className="h-3.5 w-3.5" /> Trending
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                    {dataset.title}
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Avatar className="h-12 w-12 border-2">
                      {dataset.organization.avatar ? (
                        <AvatarImage src={dataset.organization.avatar} />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/20 text-sm font-semibold uppercase">
                        {dataset.organization.name.substring(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-[2px]">
                      <div className="flex items-center gap-1.5 text-base font-medium text-foreground">
                        {dataset.organization.name}
                        {dataset.organization.verified && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <p className="text-xs">Posted {postedLabel}</p>
                    </div>
                  </div>
                  <p className="text-base leading-relaxed text-muted-foreground">
                    {dataset.description}
                  </p>
                </div>

                <div className="space-y-4 rounded-2xl border border-border/50 bg-muted/30 p-4 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/50 bg-background/80 p-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                        Reward per submission
                      </div>
                      <p className="mt-2 text-lg font-semibold text-emerald-600">
                        {rewardLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/80 p-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="h-4 w-4 text-blue-600" />
                        Active contributors
                      </div>
                      <p className="mt-2 text-lg font-semibold text-blue-600">
                        {dataset.activeContributors}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/80 p-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-4 w-4 text-orange-600" />
                        Timeline
                      </div>
                      <p
                        className={cn(
                          "mt-2 text-lg font-semibold",
                          isExpired ? "text-orange-700" : "text-orange-600"
                        )}
                      >
                        {deadlineLabel}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">Collection progress</span>
                      <span className="font-semibold text-foreground">
                        {dataset.samplesCollected.toLocaleString()} /{" "}
                        {dataset.samplesNeeded.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={progressValue} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="text-primary font-semibold">
                        {progressValue}% complete
                      </span>
                      <span>
                        {isExpired
                          ? "Submission window closed"
                          : daysUntilDeadline <= 7
                            ? "Closing soon"
                            : "Open for contributions"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-3xl border border-border/60 bg-card/70">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Quality
                  criteria
                </CardTitle>
                <CardDescription>
                  Every submission must meet these standards to be approved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {dataset.qualityCriteria.map((criterion, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/30 p-3 text-sm leading-relaxed"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-border/60 bg-card/70">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" /> Contributor
                  requirements
                </CardTitle>
                <CardDescription>
                  Make sure you have everything you need before applying.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dataset.requirements.length > 0 ? (
                  <ul className="space-y-3">
                    {dataset.requirements.map((requirement, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/30 p-3 text-sm leading-relaxed"
                      >
                        <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                        <span>{requirement}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No additional requirements listed.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {recentSubmissions.length > 0 && (
            <Card className="rounded-3xl border border-border/60 bg-card/70">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-primary" /> Recent
                  contributions
                </CardTitle>
                <CardDescription>
                  A snapshot of the latest community activity on this request.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs font-semibold">
                          {submission.profiles?.full_name
                            ?.substring(0, 2)
                            .toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-[2px]">
                        <p className="text-sm font-medium text-foreground">
                          {submission.profiles?.full_name || "Anonymous"}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                    >
                      {submission.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <Card className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5 text-primary" /> Reward summary
              </CardTitle>
              <CardDescription>
                Earn rewards for every approved submission that meets the
                quality bar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-primary/20 bg-background/80 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-primary">
                  Reward per approved submission
                </p>
                <p className="mt-2 text-3xl font-semibold text-primary">
                  {rewardLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  Submit 10 samples and earn {dataset.currency} {(dataset.rewardAmount * 10).toFixed(2)}
                </p>
              </div>

              <Separator className="bg-primary/10" />

              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Multi-step quality validation for every contribution
                </li>
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {dataset.activeContributors.toLocaleString()} active
                  contributors already participating
                </li>
                <li className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Deadline {new Date(dataset.deadline).toLocaleDateString()}
                </li>
              </ul>

              <div className="flex flex-col gap-2">
                {isCompleted ? (
                  <Button className="h-12" disabled>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Request
                    completed
                  </Button>
                ) : isPaused || isExpired ? (
                  <Button className="h-12" disabled>
                    {isPaused ? "Request paused" : "Submissions closed"}
                  </Button>
                ) : (
                  <ContributeDialog
                    datasetId={dataset.id}
                    datasetTitle={dataset.title}
                    dataType={dataset.dataType}
                  >
                    <Button className="h-12 bg-primary text-primary-foreground hover:bg-primary/90">
                      Become a contributor
                    </Button>
                  </ContributeDialog>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" /> Dataset stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Total samples needed</span>
                <span className="font-semibold text-foreground">
                  {dataset.samplesNeeded.toLocaleString()}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span>Samples collected so far</span>
                <span className="font-semibold text-foreground">
                  {dataset.samplesCollected.toLocaleString()}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span>Reward per submission</span>
                <span className="font-semibold text-foreground">
                  {rewardLabel}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span>Timeline</span>
                <span className="font-semibold text-foreground">
                  {deadlineLabel}
                </span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
