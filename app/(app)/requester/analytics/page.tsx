import { getRequesterAnalytics } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Analytics</p>
        <h1 className="text-2xl font-semibold">Insights</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Datasets</CardTitle>
            <CardDescription>Total briefs launched</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{analytics.datasets.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{totalSubmissions}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approval rate</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {Math.round((approved / Math.max(1, totalSubmissions)) * 100)}%
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Category mix</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {Object.entries(analytics.categoryBreakdown).map(([category, count]) => (
            <div key={category} className="flex items-center justify-between rounded-xl border border-border/70 p-3 text-sm">
              <span className="font-medium capitalize">{category}</span>
              <span>{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
