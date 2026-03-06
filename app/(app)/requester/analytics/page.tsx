import { getRequesterAnalytics } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";
import { BarChart3, Clock, Database, CheckCircle2 } from "lucide-react";
import { ActivityAreaChart } from "@/components/requester/dashboard/overview-panels";

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

  const topCategories = Object.entries(analytics.categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const recentSubmissions = analytics.submissions.slice(0, 8);

  return (
    <div className="space-y-6 pb-10">
      <RequesterPageHeader
        title="Performance & Quality"
        description="Measure submission throughput, approval quality, and category mix to prioritize next dataset actions."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-200 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Datasets</CardTitle>
            <Database className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold">{analytics.datasets.length}</div>
            <CardDescription className="text-xs font-medium mt-1">Total briefs launched</CardDescription>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-200 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Submissions</CardTitle>
            <BarChart3 className="h-4 w-4 text-[var(--accent)]" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold">{totalSubmissions}</div>
            <CardDescription className="text-xs font-medium mt-1">Across all datasets</CardDescription>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-emerald-50/50 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-emerald-100/50 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Approval Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-emerald-700">{approvalRate}%</div>
            <CardDescription className="text-xs text-emerald-700/80 font-medium mt-1">Quality trend indicator</CardDescription>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-amber-50/50 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-amber-100/50 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Pending Reviews</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-amber-700">{pending}</div>
            <CardDescription className="text-xs text-amber-700/80 font-medium mt-1">Submission backlog</CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityAreaChart data={analytics.timeseries.slice(-30)} />
        </div>

        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-4 border-b border-slate-200">
            <CardTitle className="text-base">Category mix</CardTitle>
            <CardDescription>Most active dataset categories</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            {topCategories.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No dataset categories yet.</p>
            ) : (
              topCategories.map(([category, count]) => (
                <div key={category} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/5 px-4 py-3 text-sm hover:bg-muted/20 transition-colors">
                  <span className="font-medium capitalize text-foreground">{category}</span>
                  <Badge variant="secondary" className="shadow-none px-2 rounded-md font-mono">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none border-border bg-background rounded-2xl overflow-hidden py-0 gap-0">
        <CardHeader className="pb-4 border-b border-slate-200 bg-muted/5">
          <CardTitle className="text-base">Recent submissions</CardTitle>
          <CardDescription>Latest review activity across your datasets</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-slate-500 p-8 text-center">No submissions yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {recentSubmissions.map((submission, index) => (
                <div key={`${submission.dataset?.title ?? "dataset"}-${submission.created_at}-${index}`} className="flex items-center justify-between px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                  <div>
                    <p className="font-semibold text-foreground line-clamp-1">{submission.dataset?.title ?? "Dataset"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {submission.created_at
                        ? new Date(submission.created_at).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                          })
                        : "Unknown timestamp"}
                    </p>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className={`shadow-none font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                      submission.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                      submission.status === 'pending' ? 'bg-blue-50 text-blue-700 border-blue-200/50' :
                      submission.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200/50' :
                      'bg-amber-50 text-amber-700 border-amber-200/50'
                    }`}
                  >
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
