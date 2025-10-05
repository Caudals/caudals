"use client";

import { Dataset } from "@/types/dataset";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Verified,
} from "lucide-react";

interface DatasetCardProps {
  dataset: Dataset;
}

export function DatasetCard({ dataset }: DatasetCardProps) {
  const progress = (dataset.samplesCollected / dataset.samplesNeeded) * 100;
  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const statusVariant = {
    active: "default" as const,
    "closing-soon": "destructive" as const,
    completed: "secondary" as const,
    paused: "outline" as const,
  };

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={statusVariant[dataset.status]}>
                {statusLabels[dataset.status]}
              </Badge>
              {dataset.featured && (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Featured
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
              {dataset.title}
            </CardTitle>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">
              {dataset.organization.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{dataset.organization.name}</span>
          {dataset.organization.verified && (
            <Verified className="h-4 w-4 text-primary" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {dataset.description}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{categoryLabels[dataset.category]}</Badge>
          <Badge variant="outline">{dataTypeLabels[dataset.dataType]}</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {dataset.samplesCollected.toLocaleString()} /{" "}
              {dataset.samplesNeeded.toLocaleString()}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-muted-foreground text-xs">Reward</p>
              <p className="font-semibold">
                {dataset.currency} {dataset.rewardAmount.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-muted-foreground text-xs">Contributors</p>
              <p className="font-semibold">{dataset.activeContributors}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-600" />
            <div>
              <p className="text-muted-foreground text-xs">Deadline</p>
              <p className="font-semibold">
                {daysUntilDeadline > 0
                  ? `${daysUntilDeadline} days`
                  : "Expired"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-600" />
            <div>
              <p className="text-muted-foreground text-xs">Posted</p>
              <p className="font-semibold">
                {new Date(dataset.datePosted).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          View Details
        </Button>
        <Button
          className="flex-1"
          disabled={
            dataset.status === "completed" || dataset.status === "paused"
          }
        >
          {dataset.status === "completed"
            ? "Completed"
            : dataset.status === "paused"
            ? "Paused"
            : "Contribute"}
        </Button>
      </CardFooter>
    </Card>
  );
}
