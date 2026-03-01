import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RequestItem = {
  id?: string;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type RequestsTableProps = {
  requests?: RequestItem[] | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

export function RequestsTable({ requests = [] }: RequestsTableProps) {
  const rows = requests ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dataset requests</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((request, index) => (
              <div key={request.id ?? `request-${index}`} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{request.title ?? "Untitled request"}</p>
                  <span className="text-xs uppercase text-muted-foreground">{request.status ?? "draft"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Created: {formatDate(request.created_at)}</p>
                {request.id ? (
                  <Link href={`/dashboard/requests/${request.id}`} className="mt-2 inline-block text-sm underline underline-offset-4">
                    Open request
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
