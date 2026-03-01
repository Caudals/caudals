import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RequesterDatasetDetailProps = {
  dataset: {
    title?: string | null;
    description?: string | null;
    status?: string | null;
  };
  submissions?: Array<Record<string, unknown>>;
  budgetSummary?: {
    approved_total_cents?: number | null;
    pending_total_cents?: number | null;
  } | null;
};

function formatCurrency(cents?: number | null) {
  const value = typeof cents === "number" ? cents / 100 : 0;
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function RequesterDatasetDetail({
  dataset,
  submissions = [],
  budgetSummary,
}: RequesterDatasetDetailProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{dataset.title ?? "Dataset detail"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{dataset.description ?? "No description provided."}</p>
          <p className="text-sm">Status: <span className="font-medium">{dataset.status ?? "draft"}</span></p>
          <p className="text-sm">Submissions: <span className="font-medium">{submissions.length}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Approved: <span className="font-medium">{formatCurrency(budgetSummary?.approved_total_cents)}</span>
          </p>
          <p>
            Pending: <span className="font-medium">{formatCurrency(budgetSummary?.pending_total_cents)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
