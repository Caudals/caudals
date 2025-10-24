"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Dataset } from "@/types/dataset";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "closing-soon": "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  paused: "bg-gray-50 text-gray-600 border-gray-200",
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

  return (
    <Card
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200",
        "hover:shadow-lg hover:border-foreground/20"
      )}
    >
      {/* Image Section - Fixed Height */}
      <Link href={`/browse/${dataset.id}`} className="block">
        <div className="relative h-48 w-full overflow-hidden bg-muted">
          <Image
            src={dataset.imageUrl}
            alt={dataset.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </Link>

      {/* Content Section - Flexible */}
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        {/* Status and Category Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn("text-xs", statusStyles[dataset.status])}
          >
            {statusLabels[dataset.status]}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {categoryLabels[dataset.category]}
          </Badge>
        </div>

        {/* Title and Description */}
        <div className="space-y-2">
          <Link href={`/browse/${dataset.id}`}>
            <h3 className="font-semibold text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
              {dataset.title}
            </h3>
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {dataset.description}
          </p>
        </div>

        {/* Organization */}
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
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

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Reward</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              ${dataset.rewardAmount}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>Contributors</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {dataset.activeContributors}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Deadline</span>
            </div>
            <p
              className={cn(
                "text-sm font-semibold",
                isExpired ? "text-red-600" : "text-foreground"
              )}
            >
              {deadlineLabel}
            </p>
          </div>
        </div>
      </CardContent>

      {/* Footer - Fixed Height */}
      <CardFooter className="flex gap-2 border-t bg-muted/30 p-4">
        <Button variant="outline" className="flex-1" size="sm" asChild>
          <Link href={`/browse/${dataset.id}`}>View</Link>
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
          <Button className="flex-1" size="sm" onClick={handleContributeClick}>
            Contribute
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
