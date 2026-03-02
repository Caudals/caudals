import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getAdminSupportTickets,
  getWaitlistEntries,
  updateAdminSupportTicket,
  updateWaitlistStatus,
} from "@/lib/actions/admin-actions";
import { createClient } from "@/lib/supabase/server";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

type FollowupItem = {
  id: string;
  title: string;
  notes: string | null;
  created_at: string | null;
  type: "dataset" | "submission";
};

type SearchParams = Promise<{
  wStatus?: "pending" | "contacted" | "qualified" | "converted";
  wSearch?: string;
  wPage?: string;
  tStatus?: "open" | "in_progress" | "resolved" | "closed";
  tPriority?: "low" | "normal" | "high" | "urgent";
  tAssigned?: string;
  tSearch?: string;
  tPage?: string;
}>;

export default async function AdminSupportPage(props: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const searchParams = await props.searchParams;

  const waitlistFilters = {
    status: searchParams.wStatus || null,
    search: searchParams.wSearch || null,
    page: Number(searchParams.wPage || "1"),
    pageSize: 25,
  };
  const ticketFilters = {
    status: searchParams.tStatus || null,
    priority: searchParams.tPriority || null,
    assignedTo: searchParams.tAssigned || null,
    search: searchParams.tSearch || null,
    page: Number(searchParams.tPage || "1"),
    pageSize: 15,
  };

  const [waitlistRes, ticketRes, followups] = await Promise.all([
    getWaitlistEntries(waitlistFilters),
    getAdminSupportTickets(ticketFilters),
    getFollowUps(),
  ]);

  if ("error" in waitlistRes || "error" in ticketRes) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">
              Unable to load support operations
            </p>
            <p className="text-sm text-muted-foreground">
              {"error" in waitlistRes
                ? waitlistRes.error
                : "error" in ticketRes
                  ? ticketRes.error
                  : "Please try again later."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const waitlist = waitlistRes.data ?? [];
  const tickets = ticketRes.data ?? [];

  const changeWaitlistStatus = async (formData: FormData) => {
    "use server";
    const id = formData.get("id") as string;
    const status = formData.get("status") as
      | "pending"
      | "contacted"
      | "qualified"
      | "converted";
    const notes = formData.get("notes") as string;
    await updateWaitlistStatus(id, status, notes);
  };

  const updateTicket = async (formData: FormData) => {
    "use server";
    await updateAdminSupportTicket({
      ticketId: formData.get("ticketId"),
      status: formData.get("status"),
      priority: formData.get("priority"),
      assignedTo: (formData.get("assignedTo") as string) || null,
      reply: formData.get("reply"),
    });
  };

  const buildQuery = (
    updates: Record<string, string | undefined>,
    keep: Record<string, string | undefined>,
  ) => {
    const next = new URLSearchParams();
    Object.entries({ ...keep, ...updates }).forEach(([key, value]) => {
      if (!value) return;
      next.set(key, value);
    });
    const qs = next.toString();
    return qs ? `/admin/support?${qs}` : "/admin/support";
  };

  const sharedKeep = {
    wStatus: searchParams.wStatus,
    wSearch: searchParams.wSearch,
    wPage: searchParams.wPage || "1",
    tStatus: searchParams.tStatus,
    tPriority: searchParams.tPriority,
    tAssigned: searchParams.tAssigned,
    tSearch: searchParams.tSearch,
    tPage: searchParams.tPage || "1",
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operations triage"
        title="Support and waitlist"
        description="Manage lead qualification and requester ticket SLAs from a unified operations surface."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/activity"
              data-dashboard-action="admin_support_open_activity"
            >
              View audit trail
            </Link>
          </Button>
        }
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>
            Support tickets ({ticketRes.total.toLocaleString()})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-2 md:grid-cols-4 lg:grid-cols-6"
            method="GET"
          >
            <input
              type="hidden"
              name="wStatus"
              value={searchParams.wStatus || ""}
            />
            <input
              type="hidden"
              name="wSearch"
              value={searchParams.wSearch || ""}
            />
            <input
              type="hidden"
              name="wPage"
              value={searchParams.wPage || "1"}
            />
            <select
              name="tStatus"
              defaultValue={searchParams.tStatus || ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All status</option>
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
            </select>
            <select
              name="tPriority"
              defaultValue={searchParams.tPriority || ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All priority</option>
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
            <select
              name="tAssigned"
              defaultValue={searchParams.tAssigned || ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All assignees</option>
              {ticketRes.assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.full_name || assignee.mail || assignee.id}
                </option>
              ))}
            </select>
            <Input
              name="tSearch"
              placeholder="Search subject/description"
              defaultValue={searchParams.tSearch || ""}
              className="h-9"
            />
            <Button type="submit" size="sm" className="h-9">
              Apply
            </Button>
            <Button variant="outline" size="sm" asChild className="h-9">
              <Link href="/admin/support">Reset</Link>
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Ticket</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Triage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No support tickets found.
                  </TableCell>
                </TableRow>
              )}
              {tickets.map((ticket) => (
                <TableRow key={ticket.id} className="align-top">
                  <TableCell className="max-w-xs">
                    <div className="font-medium line-clamp-1">
                      {ticket.subject}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {ticket.last_message_preview ||
                        ticket.description ||
                        "No details"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {ticket.message_count} message
                      {ticket.message_count === 1 ? "" : "s"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{ticket.requester?.full_name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">
                      {ticket.requester?.mail || ticket.user_id || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {ticket.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {ticket.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {ticket.assignee?.full_name || "Unassigned"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.updated_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <form
                      action={updateTicket}
                      className="flex min-w-[360px] flex-col gap-2 md:flex-row md:items-center md:justify-end"
                    >
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <select
                        name="status"
                        defaultValue={ticket.status}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="open">open</option>
                        <option value="in_progress">in_progress</option>
                        <option value="resolved">resolved</option>
                        <option value="closed">closed</option>
                      </select>
                      <select
                        name="priority"
                        defaultValue={ticket.priority}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="low">low</option>
                        <option value="normal">normal</option>
                        <option value="high">high</option>
                        <option value="urgent">urgent</option>
                      </select>
                      <select
                        name="assignedTo"
                        defaultValue={ticket.assigned_to || ""}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">unassigned</option>
                        {ticketRes.assignees.map((assignee) => (
                          <option key={assignee.id} value={assignee.id}>
                            {assignee.full_name || assignee.mail || assignee.id}
                          </option>
                        ))}
                      </select>
                      <Input
                        name="reply"
                        placeholder="Optional reply"
                        className="h-9 md:w-52"
                      />
                      <Button size="sm" type="submit" className="h-9">
                        Save
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {ticketRes.page} of {ticketRes.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={ticketRes.page <= 1}
                asChild={ticketRes.page > 1}
              >
                {ticketRes.page > 1 ? (
                  <Link
                    href={buildQuery(
                      { tPage: String(ticketRes.page - 1) },
                      sharedKeep,
                    )}
                  >
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={ticketRes.page >= ticketRes.totalPages}
                asChild={ticketRes.page < ticketRes.totalPages}
              >
                {ticketRes.page < ticketRes.totalPages ? (
                  <Link
                    href={buildQuery(
                      { tPage: String(ticketRes.page + 1) },
                      sharedKeep,
                    )}
                  >
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Waitlist ({waitlistRes.total.toLocaleString()})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <form
            className="grid gap-2 border-b px-6 py-4 md:grid-cols-4 lg:grid-cols-6"
            method="GET"
          >
            <input
              type="hidden"
              name="tStatus"
              value={searchParams.tStatus || ""}
            />
            <input
              type="hidden"
              name="tPriority"
              value={searchParams.tPriority || ""}
            />
            <input
              type="hidden"
              name="tAssigned"
              value={searchParams.tAssigned || ""}
            />
            <input
              type="hidden"
              name="tSearch"
              value={searchParams.tSearch || ""}
            />
            <input
              type="hidden"
              name="tPage"
              value={searchParams.tPage || "1"}
            />
            <select
              name="wStatus"
              defaultValue={searchParams.wStatus || ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All waitlist status</option>
              <option value="pending">pending</option>
              <option value="contacted">contacted</option>
              <option value="qualified">qualified</option>
              <option value="converted">converted</option>
            </select>
            <Input
              name="wSearch"
              placeholder="Search email/company/use case"
              defaultValue={searchParams.wSearch || ""}
              className="h-9 md:col-span-2"
            />
            <Button type="submit" size="sm" className="h-9">
              Apply
            </Button>
            <Button variant="outline" size="sm" asChild className="h-9">
              <Link href="/admin/support">Reset</Link>
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Use case</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waitlist.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No waitlist entries found.
                  </TableCell>
                </TableRow>
              )}
              {waitlist.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="font-medium">
                    {entry.full_name || "—"}
                    <div className="text-xs text-muted-foreground">
                      {entry.company}
                    </div>
                  </TableCell>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.use_case || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.updated_at
                      ? formatDistanceToNow(new Date(entry.updated_at), {
                          addSuffix: true,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <form
                      action={changeWaitlistStatus}
                      className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end"
                    >
                      <input type="hidden" name="id" value={entry.id} />
                      <select
                        name="status"
                        defaultValue={entry.status}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="pending">pending</option>
                        <option value="contacted">contacted</option>
                        <option value="qualified">qualified</option>
                        <option value="converted">converted</option>
                      </select>
                      <Input
                        name="notes"
                        placeholder="Notes"
                        className="h-9 md:w-56"
                        defaultValue={
                          (entry.metadata as { notes?: string } | null)
                            ?.notes || ""
                        }
                      />
                      <Button size="sm" type="submit" className="rounded-lg">
                        Save
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between px-6 pb-4">
            <p className="text-sm text-muted-foreground">
              Page {waitlistRes.page} of {waitlistRes.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={waitlistRes.page <= 1}
                asChild={waitlistRes.page > 1}
              >
                {waitlistRes.page > 1 ? (
                  <Link
                    href={buildQuery(
                      { wPage: String(waitlistRes.page - 1) },
                      sharedKeep,
                    )}
                  >
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={waitlistRes.page >= waitlistRes.totalPages}
                asChild={waitlistRes.page < waitlistRes.totalPages}
              >
                {waitlistRes.page < waitlistRes.totalPages ? (
                  <Link
                    href={buildQuery(
                      { wPage: String(waitlistRes.page + 1) },
                      sharedKeep,
                    )}
                  >
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Follow-ups from rejections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {followups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing to follow up right now.
            </p>
          )}
          {followups.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize">
                  {item.type}
                </Badge>
                <span>
                  {item.created_at
                    ? formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                      })
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{item.title}</div>
                <Link
                  href={
                    item.type === "dataset"
                      ? `/browse/${item.id}`
                      : "/admin/submissions"
                  }
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View
                </Link>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {item.notes || "No notes provided."}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function getFollowUps(): Promise<FollowupItem[]> {
  const supabase = await createClient();

  const [rejectedDatasets, rejectedSubmissions] = await Promise.all([
    supabase
      .from("dataset_requests")
      .select("id,title,admin_notes,created_at")
      .eq("approval_status", "rejected")
      .not("admin_notes", "is", null),
    supabase
      .from("submissions")
      .select(
        `
        id,
        notes,
        created_at,
        dataset_requests:dataset_request_id ( title )
      `,
      )
      .eq("status", "rejected")
      .not("notes", "is", null),
  ]);

  const datasetItems: FollowupItem[] =
    rejectedDatasets.data?.map((ds) => ({
      id: ds.id,
      title: ds.title || "Dataset",
      notes: ds.admin_notes,
      created_at: ds.created_at,
      type: "dataset",
    })) ?? [];

  const submissionItems: FollowupItem[] =
    rejectedSubmissions.data?.map((sub) => ({
      id: sub.id,
      title: (() => {
        const rel = Array.isArray(sub.dataset_requests)
          ? sub.dataset_requests[0]
          : (sub.dataset_requests as { title?: string } | null);
        return rel?.title || "Submission";
      })(),
      notes: sub.notes,
      created_at: sub.created_at,
      type: "submission",
    })) ?? [];

  return [...datasetItems, ...submissionItems];
}
