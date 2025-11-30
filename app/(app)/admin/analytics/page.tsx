import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminAnalyticsSummary } from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const res = await getAdminAnalyticsSummary();

  if ("error" in res) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">Unable to load analytics</p>
          <p className="text-sm text-muted-foreground">
            {res.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const data = res.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Platform engagement and growth summary
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnalyticsCard title="Users by role" entries={data.usersByRole} />
        <AnalyticsCard title="Datasets" entries={data.datasetsByStatus} />
        <AnalyticsCard title="Submissions" entries={data.submissionsByStatus} />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 text-sm font-semibold text-muted-foreground">
            <span>Date</span>
            <span className="text-center">Requests</span>
            <span className="text-center">Submissions</span>
          </div>
          <div className="mt-3 max-h-[360px] overflow-y-auto">
            {data.dailySeries.map((row) => (
              <div
                key={row.date}
                className="grid grid-cols-3 items-center rounded-lg px-3 py-2 text-sm hover:bg-muted/30"
              >
                <span className="text-muted-foreground">{row.date}</span>
                <span className="text-center font-semibold">{row.requests}</span>
                <span className="text-center font-semibold">{row.submissions}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsCard({
  title,
  entries,
}: {
  title: string;
  entries: Record<string, number>;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {Object.entries(entries).length === 0 && (
          <p className="text-muted-foreground">No data yet.</p>
        )}
        {Object.entries(entries).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="capitalize text-muted-foreground">
              {key.replace("_", " ")}
            </span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
