"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Dataset } from "@/types/dataset";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import {
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

import { ContributeDialog } from "./contribute-dialog";
import { useAuth } from "@/lib/auth/provider";

interface DatasetCardProps {
  dataset: Dataset;
}

const statusStyles: Record<Dataset["status"], string> = {
  active: "border-emerald-500/25 bg-emerald-500/15 text-emerald-700",
  "closing-soon": "border-amber-500/25 bg-amber-500/15 text-amber-700",
  completed: "border-sky-500/25 bg-sky-500/15 text-sky-700",
  paused: "border-zinc-500/25 bg-zinc-500/10 text-zinc-600",
};

export function DatasetCardImproved({ dataset }: DatasetCardProps) {
  const { user } = useAuth();
  const router = useRouter();

  const progressRaw =
    dataset.samplesNeeded > 0
      ? (dataset.samplesCollected / dataset.samplesNeeded) * 100
      : 0;
  const progressValue = Math.min(Math.round(progressRaw), 100);

  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const isActive = dataset.status === "active";
  const isCompleted = dataset.status === "completed";
  const isPaused = dataset.status === "paused";
  const isExpired = daysUntilDeadline <= 0;
  const isTrending = isActive && dataset.activeContributors >= 40;

  const deadlineLabel = isExpired
    ? "Deadline passed"
    : `${daysUntilDeadline} day${daysUntilDeadline === 1 ? "" : "s"} left`;

  const postedLabel = new Date(dataset.datePosted).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleContributeClick = () => {
    if (!user) {
      router.push("/auth/sign-up");
    }
  };

  return (
    <Card
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-none transition duration-300", // base
        "hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
      )}
    >
      <div className="relative">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
          <Image
            src={dataset.imageUrl}
            alt={`Preview image for ${dataset.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
            priority={dataset.featured}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-background/80 opacity-0 transition duration-300 group-hover:opacity-100" />
        </div>

        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "border bg-background/70 backdrop-blur-sm",
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
        </div>

        {dataset.featured && (
          <Badge className="absolute right-4 top-4 flex items-center gap-1 bg-amber-500/95 px-3 py-1 text-xs font-semibold text-white shadow">
            <Star className="h-3.5 w-3.5" /> Featured
          </Badge>
        )}

        {isTrending && (
          <Badge className="absolute bottom-4 left-4 flex items-center gap-1 bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white shadow">
            <TrendingUp className="h-3.5 w-3.5" /> Trending
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-5 p-5">
        <div className="space-y-3">
          <Link href={`/browse/${dataset.id}`} className="block">
            <h3 className="text-lg font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
              {dataset.title}
            </h3>
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {dataset.description}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2">
            {dataset.organization.avatar ? (
              <AvatarImage src={dataset.organization.avatar} />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/20 text-xs font-semibold uppercase">
              {dataset.organization.name.substring(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {dataset.organization.name}
              {dataset.organization.verified && (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Posted {postedLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Reward
            </div>
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              {dataset.currency} {dataset.rewardAmount.toFixed(2)}
            </p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4 text-blue-600" /> Contributors
            </div>
            <p className="mt-2 text-sm font-semibold text-blue-700">
              {dataset.activeContributors}
            </p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4 text-orange-600" /> Deadline
            </div>
            <p
              className={cn(
                "mt-2 text-sm font-semibold",
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
              {dataset.samplesCollected.toLocaleString()} / {" "}
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
                ? "Submissions closed"
                : daysUntilDeadline <= 7
                  ? "Closing soon"
                  : "Open for contributions"}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-4 border-t border-border/60 bg-muted/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Deadline: {new Date(dataset.deadline).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              {isCompleted
                ? "Completed"
                : isPaused
                  ? "Paused"
                  : isExpired
                    ? "Awaiting review"
                    : `${dataset.rewardAmount.toFixed(2)} ${dataset.currency} per submission`}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="h-11 flex-1" asChild>
            <Link href={`/browse/${dataset.id}`}>View details</Link>
          </Button>

          {isCompleted ? (
            <Button className="h-11 flex-1" disabled>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Completed
            </Button>
          ) : isPaused || isExpired ? (
            <Button className="h-11 flex-1" disabled>
              {isPaused ? "Paused" : "Closed"}
            </Button>
          ) : user ? (
            <ContributeDialog
              datasetId={dataset.id}
              datasetTitle={dataset.title}
              dataType={dataset.dataType}
            >
              <Button className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                Contribute now
              </Button>
            </ContributeDialog>
          ) : (
            <Button
              className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleContributeClick}
            >
              Sign up to contribute
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
