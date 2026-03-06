import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RecentRequests() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">No recent requests available yet.</p>
        <Link href="/requester/datasets" className="text-sm font-medium underline underline-offset-4">
          View datasets
        </Link>
      </CardContent>
    </Card>
  );
}
