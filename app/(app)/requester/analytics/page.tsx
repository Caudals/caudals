import { getRequesterAnalytics } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function AnalyticsPage() {
  const analytics = await getRequesterAnalytics();

  if ("error" in analytics) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {analytics.error}
      </div>
    );
  }

  const totalSubmissions = analytics.submissions.length;
  const approved = analytics.submissions.filter((submission) => submission.status === "approved").length;
  const pending = analytics.submissions.filter((submission) => submission.status === "pending").length;
  const approvalRate = Math.round((approved / Math.max(1, totalSubmissions)) * 100);

  const last7Days = analytics.timeseries.slice(-7);
  const last7Submitted = last7Days.reduce((sum, day) => sum + day.submissions, 0);
  const last7Approved = last7Days.reduce((sum, day) => sum + day.approvals, 0);

  const topCategories = Object.entries(analytics.categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const recentSubmissions = analytics.submissions.slice(0, 8);

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        eyebrow="Analytics"
        title="Performance and quality insights"
        description="Measure submission throughput, approval quality, and category mix to prioritize next dataset actions."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader>
            <CardTitle>Datasets</CardTitle>
            <CardDescription>Total briefs launched</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{analytics.datasets.length}</CardContent>
        </Card>
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>Across all requester datasets</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{totalSubmissions}</CardContent>
        </Card>
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader>
            <CardTitle>Approval rate</CardTitle>
            <CardDescription>Quality trend indicator</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{approvalRate}%</CardContent>
        </Card>
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader>
            <CardTitle>Pending reviews</CardTitle>
            <CardDescription>Submission backlog</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{pending}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-card shadow-sm border border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
            <CardDescription>Submission and approval pulse</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Submissions</p>
                <p className="mt-2 text-3xl font-semibold">{last7Submitted}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Approvals</p>
                <p className="mt-2 text-3xl font-semibold">{last7Approved}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {last7Days.map((day) => (
                <div key={day.date} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{new Date(day.date).toLocaleDateString()}</span>
                  <span className="font-medium">
                    {day.submissions} submitted · {day.approvals} approved
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border border-border">
          <CardHeader>
            <CardTitle>Category mix</CardTitle>
            <CardDescription>Most active dataset categories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dataset categories yet.</p>
            ) : (
              topCategories.map(([category, count]) => (
                <div key={category} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span className="font-medium capitalize">{category}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card shadow-sm border border-border">
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
          <CardDescription>Latest review activity across your datasets</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="space-y-2">
              {recentSubmissions.map((submission, index) => (
                <div key={`${submission.dataset?.title ?? "dataset"}-${submission.created_at}-${index}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{submission.dataset?.title ?? "Dataset"}</p>
                    <p className="text-xs text-muted-foreground">
                      {submission.created_at
                        ? new Date(submission.created_at).toLocaleString()
                        : "Unknown timestamp"}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {submission.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
