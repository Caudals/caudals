"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Dataset } from "@/types/dataset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { categoryLabels, statusLabels } from "@/lib/data/datasets";
import { CheckCircle2, Clock, DollarSign, Users } from "lucide-react";

import { ContributeDialog } from "./contribute-dialog";
import { useAuth } from "@/lib/auth/provider";

interface DatasetCardProps {
  dataset: Dataset;
}

const statusStyles: Record<Dataset["status"], string> = {
  active: "bg-emerald-50 text-emerald-700",
  "closing-soon": "bg-amber-50 text-amber-700",
  completed: "bg-blue-50 text-blue-700",
  paused: "bg-gray-50 text-gray-600",
};

export function DatasetCardImproved({ dataset }: DatasetCardProps) {
  const { user } = useAuth();
  const router = useRouter();

  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const isCompleted = dataset.status === "completed";
  const isPaused = dataset.status === "paused";
  const isExpired = daysUntilDeadline <= 0;

  const deadlineLabel = isExpired ? "Expired" : `${daysUntilDeadline}d left`;

  const handleContributeClick = () => {
    if (!user) {
      router.push("/auth/sign-up");
    }
  };

  const rewardDisplay = `$${dataset.rewardAmount.toLocaleString(undefined, {
    minimumFractionDigits: dataset.rewardAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: dataset.rewardAmount % 1 === 0 ? 0 : 2,
  })}`;

  const contributorDisplay = dataset.activeContributors.toLocaleString();

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-card transition-all duration-300 hover:shadow-lg">
      {/* Image Section */}
      <Link
        href={`/browse/${dataset.id}`}
        className="relative block overflow-hidden"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          <Image
            src={dataset.imageUrl}
            alt={dataset.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        {/* Badges overlay on image */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              "text-xs font-medium shadow-sm",
              statusStyles[dataset.status]
            )}
          >
            {statusLabels[dataset.status]}
          </Badge>
          <Badge variant="secondary" className="text-xs font-medium shadow-sm">
            {categoryLabels[dataset.category]}
          </Badge>
        </div>
      </Link>

      {/* Content Section */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title */}
        <div className="mb-3">
          <Link href={`/browse/${dataset.id}`}>
            <h3 className="text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2">
              {dataset.title}
            </h3>
          </Link>
        </div>

        {/* Description */}
        <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
          {dataset.description}
        </p>

        {/* Organization */}
        <div className="mb-4 flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {dataset.organization.avatar ? (
              <AvatarImage src={dataset.organization.avatar} />
            ) : null}
            <AvatarFallback className="text-xs">
              {dataset.organization.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1 text-sm">
            <span className="font-medium text-foreground">
              {dataset.organization.name}
            </span>
            {dataset.organization.verified && (
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="mb-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              {rewardDisplay}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{contributorDisplay}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span
              className={cn(
                "text-xs font-medium",
                isExpired ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {deadlineLabel}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-auto flex gap-2">
          <Button variant="outline" className="flex-1" size="sm" asChild>
            <Link href={`/browse/${dataset.id}`}>View Details</Link>
          </Button>

          {isCompleted ? (
            <Button className="flex-1" size="sm" disabled>
              Completed
            </Button>
          ) : isPaused || isExpired ? (
            <Button className="flex-1" size="sm" disabled>
              {isPaused ? "Paused" : "Closed"}
            </Button>
          ) : user ? (
            <ContributeDialog
              datasetId={dataset.id}
              datasetTitle={dataset.title}
              dataType={dataset.dataType}
            >
              <Button className="flex-1" size="sm">
                Contribute
              </Button>
            </ContributeDialog>
          ) : (
            <Button
              className="flex-1"
              size="sm"
              onClick={handleContributeClick}
            >
              Contribute
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
