import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminActivityLog } from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type SearchParams = Promise<{
  action?: string;
  target?: string;
}>;

export default async function AdminActivityPage(props: { searchParams: SearchParams }) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const action = searchParams.action;
  const target = searchParams.target;

  const result = await getAdminActivityLog({
    actionType: action,
    targetType: target,
    limit: 200,
  });

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Unable to load activity</p>
            <p className="text-sm text-muted-foreground">
              {result.error || "Please try again later."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const logs = result.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Activity & Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Trace every admin action with timestamp and target.
          </p>
        </div>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No activity yet.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-muted/30">
                  {(() => {
                    const adminProfile = Array.isArray(entry.profiles)
                      ? entry.profiles[0]
                      : entry.profiles;
                    return (
                      <>
                        <TableCell className="font-medium capitalize">
                          {entry.action_type?.replace("_", " ")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {entry.target_type || "item"}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {entry.target_id}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {adminProfile?.full_name || "Admin"}
                          <div className="text-xs text-muted-foreground">
                            {adminProfile?.mail}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.created_at
                            ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.notes || "—"}
                        </TableCell>
                      </>
                    );
                  })()}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
