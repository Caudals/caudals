"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmissionsPanel, SubmissionItem } from "@/components/requester/datasets/submissions-panel";
import { ExportPanel, ExportRecord } from "@/components/requester/datasets/export-panel";
import { AutomationPanel } from "@/components/requester/datasets/automation-panel";

type RequesterDatasetDetail = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  approval_status?: string;
  reward_amount?: number;
  data_type?: string;
  currency?: string | null;
  deadline?: string | null;
  image_url?: string | null;
  quality_criteria?: string[];
  requirements?: string[];
  samples_collected?: number;
  samples_needed?: number;
  total_budget?: number | null;
  paid_amount?: number | null;
  pendingSubmissions?: number;
  exports?: ExportRecord[];
  automation_config?: Record<string, unknown> | null;
};

export function DatasetWorkspace({
  detail,
  submissions,
}: {
  detail: RequesterDatasetDetail;
  submissions: SubmissionItem[];
}) {
  const samplesCollected = Number(detail.samples_collected ?? 0);
  const samplesNeeded = Number(detail.samples_needed ?? 0);
  const progress =
    samplesNeeded > 0
      ? Math.min(100, Math.round((samplesCollected / samplesNeeded) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{detail.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {detail.status ?? "draft"}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {detail.approval_status ?? "pending"}
                </Badge>
                <Badge variant="outline">{detail.data_type ?? "mixed"}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/requester/datasets/new?duplicate=${detail.id}`}>
                  Duplicate
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/requester/datasets/${detail.id}/edit`}>
                  Edit brief
                </Link>
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {detail.description || "No description provided yet."}
          </p>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs uppercase text-muted-foreground">Samples</p>
              <p className="text-lg font-semibold">
                {samplesCollected} / {samplesNeeded}
              </p>
              <Progress className="mt-2" value={progress} />
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs uppercase text-muted-foreground">Reward</p>
              <p className="text-lg font-semibold">
                {detail.currency ?? "USD"} {Number(detail.reward_amount ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs uppercase text-muted-foreground">Budget</p>
              <p className="text-lg font-semibold">
                {(detail.currency ?? "USD")} {Number(detail.paid_amount ?? 0).toLocaleString()} /{" "}
                {Number(detail.total_budget ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs uppercase text-muted-foreground">Deadline</p>
              <p className="text-lg font-semibold">
                {detail.deadline
                  ? new Date(detail.deadline).toLocaleDateString()
                  : "No deadline"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="submissions" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="submissions">
            Submissions ({submissions.length})
          </TabsTrigger>
          <TabsTrigger value="exports">
            Exports ({detail.exports?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Brief requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Quality criteria</p>
                {detail.quality_criteria && detail.quality_criteria.length > 0 ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {detail.quality_criteria.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No criteria listed.</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Contributor requirements</p>
                {detail.requirements && detail.requirements.length > 0 ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {detail.requirements.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No requirements listed.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Submission review queue</CardTitle>
            </CardHeader>
            <CardContent>
              <SubmissionsPanel submissions={submissions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Export jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <ExportPanel datasetId={detail.id} exports={detail.exports ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Automation rules</CardTitle>
            </CardHeader>
            <CardContent>
              <AutomationPanel
                datasetId={detail.id}
                config={detail.automation_config ?? {}}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
