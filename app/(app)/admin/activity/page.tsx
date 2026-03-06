import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminActivityLog } from "@/lib/actions/admin-actions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Filter, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

type SearchParams = Promise<{
  action?: string;
  target?: string;
  admin?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}>;

export default async function AdminActivityPage(props: {
  searchParams: SearchParams;
}) {
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
      <Card className="border-destructive/40 bg-destructive/5 shadow-none">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">
              Unable to load activity
            </p>
            <p className="text-sm text-slate-500">
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
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Activity and Audit Log"
        description="Trace platform-wide admin actions, moderation decisions, and settings changes."
        actions={
          <Button asChild variant="outline" className="shadow-none">
            <Link
              href="/admin/users"
              data-dashboard-action="admin_activity_open_users"
            >
              Review roles
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-2xl border border-border"
          method="GET"
        >
          <div className="flex items-center gap-2 px-2 text-slate-500">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Filter</span>
          </div>
          
          <div className="flex-1 grid grid-cols-2 md:flex md:flex-row gap-2">
            <select
              name="action"
              defaultValue={action ?? ""}
              className="h-9 w-full md:w-auto min-w-[140px] rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
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
              className="h-9 w-full md:w-auto min-w-[140px] rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
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
              className="h-9 w-full md:w-auto min-w-[140px] rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
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
              className="h-9 w-full md:w-auto rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none text-slate-500"
            />
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              className="h-9 w-full md:w-auto rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none text-slate-500"
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto ml-auto">
            <select
              name="pageSize"
              defaultValue={String(currentPageSize)}
              className="h-9 rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" className="h-9 px-4 rounded-lg shadow-none">
              Apply
            </Button>
            {(action || target || admin || dateFrom || dateTo) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                asChild
                className="h-9 text-slate-500"
              >
                <Link href="/admin/activity">Clear</Link>
              </Button>
            )}
          </div>
        </form>

        <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Action</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Target</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Admin</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">When</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pr-8">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-12 text-center text-sm text-slate-500"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Search className="h-8 w-8 text-slate-300 mb-3" />
                        <p>No activity records found matching these criteria.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((entry) => (
                  <TableRow key={entry.id} className="group hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                    {(() => {
                      const adminProfile = Array.isArray(entry.profiles)
                        ? entry.profiles[0]
                        : entry.profiles;
                      return (
                        <>
                          <TableCell className="pl-8 py-4">
                            <span className="font-medium capitalize text-sm text-slate-900">
                              {entry.action_type?.replace("_", " ")}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant="secondary" className="capitalize text-xs font-medium bg-slate-100 text-slate-700 border-slate-200 shadow-none">
                                {entry.target_type || "item"}
                              </Badge>
                              <span className="text-[11px] font-mono text-slate-400">
                                {entry.target_id?.substring(0, 12)}...
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-900">
                                {adminProfile?.full_name || "Admin"}
                              </span>
                              <span className="text-xs text-slate-500">
                                {adminProfile?.mail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 text-sm text-slate-500">
                            {entry.created_at
                              ? formatDistanceToNow(new Date(entry.created_at), {
                                  addSuffix: true,
                                })
                              : "—"}
                          </TableCell>
                          <TableCell className="py-4 pr-8">
                            <span className="text-sm text-slate-500 block max-w-[280px] truncate" title={entry.notes || ""}>
                              {entry.notes || "—"}
                            </span>
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

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 px-2">
          <p className="text-sm text-slate-500">
            Showing page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
            <span className="font-medium text-foreground">{totalPages || 1}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              asChild={currentPage > 1}
              className="shadow-none rounded-lg"
            >
              {currentPage > 1 ? (
                <Link href={queryWith({ page: String(currentPage - 1) })}>
                  Previous
                </Link>
              ) : (
                <span>Previous</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              asChild={currentPage < totalPages}
              className="shadow-none rounded-lg"
            >
              {currentPage < totalPages ? (
                <Link href={queryWith({ page: String(currentPage + 1) })}>
                  Next
                </Link>
              ) : (
                <span>Next</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
