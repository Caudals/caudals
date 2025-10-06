"use client";

import { Dataset } from "@/types/dataset";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import {
  Calendar,
  Users,
  DollarSign,
  CheckCircle2,
  Clock,
  Star,
  TrendingUp,
} from "lucide-react";
import { ContributeDialog } from "./contribute-dialog";
import Link from "next/link";

interface DatasetCardProps {
  dataset: Dataset;
}

export function DatasetCardImproved({ dataset }: DatasetCardProps) {
  const progress = (dataset.samplesCollected / dataset.samplesNeeded) * 100;
  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const statusConfig = {
    active: {
      variant: "default" as const,
      className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    },
    "closing-soon": {
      variant: "destructive" as const,
      className: "bg-orange-500/10 text-orange-700 border-orange-500/20",
    },
    completed: {
      variant: "secondary" as const,
      className: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    },
    paused: {
      variant: "outline" as const,
      className: "bg-gray-500/10 text-gray-700 border-gray-500/20",
    },
  };

  const isActive = dataset.status === "active";
  const isCompleted = dataset.status === "completed";

  return (
    <Card className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-2">
      {/* Featured ribbon */}
      {dataset.featured && (
        <div className="absolute top-4 -right-12 rotate-45 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-semibold py-1 px-12 shadow-lg z-10">
          <Star className="h-3 w-3 inline mr-1" />
          Featured
        </div>
      )}

      <CardHeader className="space-y-4 pb-4">
        {/* Status and Category Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge className={statusConfig[dataset.status].className}>
              {statusLabels[dataset.status]}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {categoryLabels[dataset.category]}
            </Badge>
          </div>
          {isActive && dataset.activeContributors > 50 && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/20 text-emerald-700 bg-emerald-50"
            >
              <TrendingUp className="h-3 w-3" />
              Hot
            </Badge>
          )}
        </div>

        {/* Title */}
        <Link href={`/browse/${dataset.id}`} className="block">
          <h3 className="text-xl font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors cursor-pointer">
            {dataset.title}
          </h3>
        </Link>

        {/* Organization */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Avatar className="h-8 w-8 border-2">
            {dataset.organization.avatar ? (
              <AvatarImage src={dataset.organization.avatar} />
            ) : null}
            <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-primary/10 to-primary/20">
              {dataset.organization.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {dataset.organization.name}
            </span>
            {dataset.organization.verified && (
              <CheckCircle2 className="h-4 w-4 text-primary fill-primary/20" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {dataset.description}
        </p>

        {/* Data Type Badge */}
        <div>
          <Badge variant="secondary" className="font-normal">
            📁 {dataTypeLabels[dataset.dataType]}
          </Badge>
        </div>

        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className="font-bold text-foreground">
              {dataset.samplesCollected.toLocaleString()} /{" "}
              {dataset.samplesNeeded.toLocaleString()}
            </span>
          </div>
          <Progress value={progress} className="h-2.5" />
          <div className="text-right">
            <span className="text-xs font-semibold text-primary">
              {Math.round(progress)}% Complete
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="flex flex-col items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <DollarSign className="h-5 w-5 text-emerald-600 mb-1" />
            <p className="text-xs text-muted-foreground">Reward</p>
            <p className="font-bold text-sm text-emerald-700">
              {dataset.currency} {dataset.rewardAmount.toFixed(2)}
            </p>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-blue-50 border border-blue-100">
            <Users className="h-5 w-5 text-blue-600 mb-1" />
            <p className="text-xs text-muted-foreground">Contributors</p>
            <p className="font-bold text-sm text-blue-700">
              {dataset.activeContributors}
            </p>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-orange-50 border border-orange-100">
            <Clock className="h-5 w-5 text-orange-600 mb-1" />
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="font-bold text-sm text-orange-700">
              {daysUntilDeadline > 0 ? `${daysUntilDeadline}d` : "Expired"}
            </p>
          </div>
        </div>

        {/* Posted Date */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            Posted{" "}
            {new Date(dataset.datePosted).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </CardContent>

      <CardFooter className="gap-3 pt-4">
        <Button variant="outline" className="flex-1" asChild>
          <Link href={`/browse/${dataset.id}`}>View Details</Link>
        </Button>
        {isCompleted ? (
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Completed
          </Button>
        ) : dataset.status === "paused" ? (
          <Button className="flex-1" disabled>
            Paused
          </Button>
        ) : (
          <ContributeDialog
            datasetId={dataset.id}
            datasetTitle={dataset.title}
            dataType={dataset.dataType}
          >
            <Button className="flex-1 bg-primary hover:bg-primary/90">
              Contribute Now
            </Button>
          </ContributeDialog>
        )}
      </CardFooter>
    </Card>
  );
}
