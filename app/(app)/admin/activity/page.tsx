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
import Link from "next/link";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<{
  action?: string;
  target?: string;
  admin?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}>;

export default async function AdminActivityPage(props: { searchParams: SearchParams }) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const action = searchParams.action?.trim() || undefined;
  const target = searchParams.target?.trim() || undefined;
  const admin = searchParams.admin?.trim() || undefined;
  const dateFrom = searchParams.from?.trim() || undefined;
  const dateTo = searchParams.to?.trim() || undefined;
  const page = Number(searchParams.page || "1");
  const pageSize = Number(searchParams.pageSize || "25");

  const result = await getAdminActivityLog({
    actionType: action,
    targetType: target,
    adminId: admin,
    dateFrom,
    dateTo,
    page,
    pageSize,
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

  const {
    data: logs,
    filterOptions,
    page: currentPage,
    pageSize: currentPageSize,
    total,
    totalPages,
  } = result;

  const queryWith = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const source: Record<string, string | undefined> = {
      action,
      target,
      admin,
      from: dateFrom,
      to: dateTo,
      page: String(currentPage),
      pageSize: String(currentPageSize),
      ...updates,
    };

    Object.entries(source).forEach(([key, value]) => {
      if (!value) return;
      if (key === "page" && value === "1") return;
      next.set(key, value);
    });

    const qs = next.toString();
    return qs ? `/admin/activity?${qs}` : "/admin/activity";
  };

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
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" method="GET">
            <select
              name="action"
              defaultValue={action ?? ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All actions</option>
              {filterOptions.actions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              name="target"
              defaultValue={target ?? ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All targets</option>
              {filterOptions.targets.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              name="admin"
              defaultValue={admin ?? ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All admins</option>
              {filterOptions.admins.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.full_name || entry.mail || entry.id}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="from"
              defaultValue={dateFrom}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <div className="flex gap-2">
              <select
                name="pageSize"
                defaultValue={String(currentPageSize)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}/page
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" className="h-9">
                Apply
              </Button>
              <Button type="button" size="sm" variant="outline" asChild className="h-9">
                <Link href="/admin/activity">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Recent activity ({total.toLocaleString()})
          </CardTitle>
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            asChild={currentPage > 1}
          >
            {currentPage > 1 ? (
              <Link href={queryWith({ page: String(currentPage - 1) })}>Previous</Link>
            ) : (
              <span>Previous</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            asChild={currentPage < totalPages}
          >
            {currentPage < totalPages ? (
              <Link href={queryWith({ page: String(currentPage + 1) })}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
