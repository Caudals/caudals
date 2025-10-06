"use client";

import { Dataset } from "@/types/dataset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  FileText,
  Target,
  ShieldCheck,
  Award,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import { ContributeDialog } from "@/components/browse/contribute-dialog";
import Link from "next/link";

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

export function DatasetDetailClient({
  dataset,
  submissions,
}: DatasetDetailClientProps) {
  const progress = (dataset.samplesCollected / dataset.samplesNeeded) * 100;
  const daysUntilDeadline = Math.ceil(
    (new Date(dataset.deadline).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const statusConfig = {
    active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    "closing-soon": "bg-orange-500/10 text-orange-700 border-orange-500/20",
    completed: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    paused: "bg-gray-500/10 text-gray-700 border-gray-500/20",
  };

  const recentSubmissions = submissions.slice(0, 5);

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/browse"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Browse
        </Link>
      </div>

      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-wrap gap-3 mb-4">
          <Badge className={statusConfig[dataset.status]}>
            {statusLabels[dataset.status]}
          </Badge>
          <Badge variant="outline">{categoryLabels[dataset.category]}</Badge>
          <Badge variant="secondary">
            📁 {dataTypeLabels[dataset.dataType]}
          </Badge>
          {dataset.featured && (
            <Badge className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
              ⭐ Featured
            </Badge>
          )}
        </div>

        <h1 className="text-4xl font-bold mb-4">{dataset.title}</h1>

        <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-12 w-12 border-2">
            {dataset.organization.avatar ? (
              <AvatarImage src={dataset.organization.avatar} />
            ) : null}
            <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-primary/10 to-primary/20">
              {dataset.organization.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{dataset.organization.name}</h3>
              {dataset.organization.verified && (
                <CheckCircle2 className="h-5 w-5 text-primary fill-primary/20" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Posted{" "}
              {new Date(dataset.datePosted).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <p className="text-lg text-muted-foreground leading-relaxed">
          {dataset.description}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Collection Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold">
                  {dataset.samplesCollected.toLocaleString()}
                </span>
                <span className="text-muted-foreground">
                  of {dataset.samplesNeeded.toLocaleString()} samples
                </span>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="text-right">
                <span className="text-lg font-semibold text-primary">
                  {Math.round(progress)}% Complete
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quality Criteria */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Quality Criteria
              </CardTitle>
              <CardDescription>
                Your submissions must meet these standards
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {dataset.qualityCriteria.map((criterion, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm leading-relaxed">{criterion}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contributor Requirements
              </CardTitle>
              <CardDescription>What you need to participate</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {dataset.requirements.map((requirement, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span className="text-sm leading-relaxed">
                      {requirement}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          {recentSubmissions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Recent Contributions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentSubmissions.map((submission, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {submission.profiles?.full_name
                              ?.substring(0, 2)
                              .toUpperCase() || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {submission.profiles?.full_name || "Anonymous"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(
                              submission.created_at
                            ).toLocaleDateString()}
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
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Reward Card */}
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Reward per Sample
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-4xl font-bold text-primary mb-2">
                  {dataset.currency} {dataset.rewardAmount.toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Earn up to {dataset.currency}{" "}
                  {(dataset.rewardAmount * 10).toFixed(2)} with 10 submissions
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Dataset Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">Active Contributors</span>
                </div>
                <span className="font-semibold">
                  {dataset.activeContributors}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Time Remaining</span>
                </div>
                <span className="font-semibold">
                  {daysUntilDeadline > 0
                    ? `${daysUntilDeadline} days`
                    : "Expired"}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Deadline</span>
                </div>
                <span className="font-semibold">
                  {new Date(dataset.deadline).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* CTA Card */}
          {dataset.status === "active" ? (
            <ContributeDialog
              datasetId={dataset.id}
              datasetTitle={dataset.title}
              dataType={dataset.dataType}
            >
              <Button size="lg" className="w-full text-lg py-6">
                <DollarSign className="mr-2 h-5 w-5" />
                Contribute Now
              </Button>
            </ContributeDialog>
          ) : dataset.status === "completed" ? (
            <Button size="lg" className="w-full text-lg py-6" disabled>
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Completed
            </Button>
          ) : (
            <Button size="lg" className="w-full text-lg py-6" disabled>
              Paused
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
