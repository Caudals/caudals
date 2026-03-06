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
import { AlertCircle, Filter, Search, ArrowRight, CheckCircle, LifeBuoy } from "lucide-react";
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
    pageSize: 15,
  };
  const ticketFilters = {
    status: searchParams.tStatus || null,
    priority: searchParams.tPriority || null,
    assignedTo: searchParams.tAssigned || null,
    search: searchParams.tSearch || null,
    page: Number(searchParams.tPage || "1"),
    pageSize: 10,
  };

  const [waitlistRes, ticketRes, followups] = await Promise.all([
    getWaitlistEntries(waitlistFilters),
    getAdminSupportTickets(ticketFilters),
    getFollowUps(),
  ]);

  if ("error" in waitlistRes || "error" in ticketRes) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-none rounded-2xl">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">
              Unable to load support operations
            </p>
            <p className="text-sm text-slate-500">
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
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Support & Waitlist"
        description="Manage lead qualification and requester ticket SLAs from a unified operations surface."
        actions={
          <Button asChild variant="outline" className="shadow-none rounded-lg">
            <Link
              href="/admin/activity"
              data-dashboard-action="admin_support_open_activity"
            >
              View audit trail
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex flex-col gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <form className="flex flex-wrap items-center gap-2" method="GET">
              <div className="flex items-center gap-2 pl-1 pr-3 text-slate-500">
                <LifeBuoy className="h-4 w-4" />
                <span className="text-sm font-semibold">Tickets</span>
              </div>
              <input type="hidden" name="wStatus" value={searchParams.wStatus || ""} />
              <input type="hidden" name="wSearch" value={searchParams.wSearch || ""} />
              <input type="hidden" name="wPage" value={searchParams.wPage || "1"} />
              
              <select
                name="tStatus"
                defaultValue={searchParams.tStatus || ""}
                className="h-8 w-[120px] rounded-lg border-slate-200 bg-white px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
              >
                <option value="">All status</option>
                <option value="open">open</option>
                <option value="in_progress">in progress</option>
                <option value="resolved">resolved</option>
                <option value="closed">closed</option>
              </select>
              <select
                name="tPriority"
                defaultValue={searchParams.tPriority || ""}
                className="h-8 w-[110px] rounded-lg border-slate-200 bg-white px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
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
                className="h-8 w-[130px] rounded-lg border-slate-200 bg-white px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
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
                placeholder="Search subject..."
                defaultValue={searchParams.tSearch || ""}
                className="h-8 w-[150px] shadow-none rounded-lg text-xs bg-white border-slate-200"
              />
              <Button type="submit" size="sm" className="h-8 px-3 rounded-lg shadow-none text-xs">
                Apply
              </Button>
              {(searchParams.tStatus || searchParams.tPriority || searchParams.tAssigned || searchParams.tSearch) && (
                <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs text-slate-500">
                  <Link href="/admin/support">Clear</Link>
                </Button>
              )}
            </form>
          </div>

          <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-6">Ticket</TableHead>
                    <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Status & Priority</TableHead>
                    <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-6">Triage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-12 text-center text-sm text-slate-500"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <Search className="h-8 w-8 text-slate-300 mb-3" />
                          <p>No support tickets found.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id} className="align-top hover:bg-slate-50/50 transition-colors border-slate-200">
                      <TableCell className="max-w-xs pl-6 py-4">
                        <div className="font-medium text-sm text-slate-900 line-clamp-1">
                          {ticket.subject}
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-2 mt-0.5 pr-2">
                          {ticket.last_message_preview || ticket.description || "No details"}
                        </div>
                        <div className="mt-2 text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                          <span>{ticket.message_count} msg</span>
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(ticket.updated_at))}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          <Badge variant="secondary" className={`shadow-none font-medium text-[10px] uppercase tracking-wider ${ticket.status === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {ticket.status.replace("_", " ")}
                          </Badge>
                          <Badge variant="secondary" className={`shadow-none font-medium text-[10px] uppercase tracking-wider ${ticket.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' : ticket.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {ticket.priority}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 pr-6">
                        <form
                          action={updateTicket}
                          className="flex flex-col gap-2 items-end min-w-[200px]"
                        >
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <div className="flex gap-2">
                            <select
                              name="status"
                              defaultValue={ticket.status}
                              className="h-8 rounded-md border-slate-200 bg-slate-50 px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                            >
                              <option value="open">open</option>
                              <option value="in_progress">in progress</option>
                              <option value="resolved">resolved</option>
                              <option value="closed">closed</option>
                            </select>
                            <select
                              name="assignedTo"
                              defaultValue={ticket.assigned_to || ""}
                              className="h-8 rounded-md border-slate-200 bg-slate-50 px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                            >
                              <option value="">unassigned</option>
                              {ticketRes.assignees.map((assignee) => (
                                <option key={assignee.id} value={assignee.id}>
                                  {assignee.full_name || assignee.mail || assignee.id}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              name="reply"
                              placeholder="Quick reply"
                              className="h-8 text-xs shadow-none w-32 border-slate-200"
                            />
                            <Button size="sm" type="submit" className="h-8 text-xs px-3 shadow-none rounded-md">
                              Save
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t border-slate-200 p-4 bg-white">
                <p className="text-xs font-medium text-slate-500">
                  Page {ticketRes.page} of {ticketRes.totalPages || 1}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ticketRes.page <= 1}
                    asChild={ticketRes.page > 1}
                    className="shadow-none rounded-lg h-8 text-xs border-slate-200"
                  >
                    {ticketRes.page > 1 ? (
                      <Link
                        href={buildQuery(
                          { tPage: String(ticketRes.page - 1) },
                          sharedKeep,
                        )}
                      >
                        Prev
                      </Link>
                    ) : (
                      <span>Prev</span>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ticketRes.page >= ticketRes.totalPages}
                    asChild={ticketRes.page < ticketRes.totalPages}
                    className="shadow-none rounded-lg h-8 text-xs border-slate-200"
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
        </div>

        <div className="flex flex-col gap-6">
          <Card className="border-slate-200 shadow-none bg-white rounded-2xl">
            <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Rejection Follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
              {followups.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-8 w-8 text-emerald-500/30 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Nothing to follow up right now.</p>
                </div>
              )}
              {followups.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 bg-slate-50/50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="shadow-none text-[9px] uppercase tracking-wider font-semibold bg-white border-slate-200 text-slate-700">
                      {item.type}
                    </Badge>
                    <span className="text-[10px] text-slate-400">
                      {item.created_at
                        ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 line-clamp-1">{item.title}</div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {item.notes || "No notes provided."}
                    </p>
                  </div>
                  <div className="mt-1 flex justify-end">
                    <Button variant="ghost" size="sm" asChild className="h-6 text-[10px] text-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 px-2">
                      <Link
                        href={
                          item.type === "dataset"
                            ? `/browse/${item.id}`
                            : "/admin/submissions"
                        }
                      >
                        View context <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
            <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                Waitlist <Badge variant="secondary" className="font-mono shadow-none bg-white border-slate-200">{waitlistRes.total.toLocaleString()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-3 pl-4">Lead</TableHead>
                    <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-3 text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitlist.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="py-8 text-center text-sm text-slate-500"
                      >
                        No waitlist entries.
                      </TableCell>
                    </TableRow>
                  )}
                  {waitlist.map((entry) => (
                    <TableRow key={entry.id} className="align-top hover:bg-slate-50/50 transition-colors border-slate-200">
                      <TableCell className="pl-4 py-3">
                        <div className="font-medium text-sm text-slate-900">
                          {entry.full_name || entry.email}
                        </div>
                        {entry.company && (
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mt-1">
                            {entry.company}
                          </div>
                        )}
                        <Badge variant="secondary" className={`mt-2 shadow-none font-medium text-[9px] uppercase tracking-wider ${entry.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : entry.status === 'converted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 pr-4">
                        <form
                          action={changeWaitlistStatus}
                          className="flex flex-col gap-2 items-end"
                        >
                          <input type="hidden" name="id" value={entry.id} />
                          <select
                            name="status"
                            defaultValue={entry.status}
                            className="h-7 w-full rounded-md border-slate-200 bg-slate-50 px-2 text-[10px] focus:ring-2 focus:ring-ring focus:outline-none"
                          >
                            <option value="pending">pending</option>
                            <option value="contacted">contacted</option>
                            <option value="qualified">qualified</option>
                            <option value="converted">converted</option>
                          </select>
                          <Button size="sm" type="submit" className="h-7 w-full text-[10px] shadow-none rounded-md px-2">
                            Save
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-3 border-t border-slate-200 flex justify-between items-center bg-white">
                 <div className="flex gap-1 w-full justify-between">
                    <Button variant="outline" size="sm" disabled={waitlistRes.page <= 1} asChild={waitlistRes.page > 1} className="shadow-none h-7 text-xs px-2 border-slate-200">
                       {waitlistRes.page > 1 ? <Link href={buildQuery({ wPage: String(waitlistRes.page - 1) }, sharedKeep)}>Prev</Link> : <span>Prev</span>}
                    </Button>
                    <span className="text-[10px] font-medium text-slate-500 self-center">{waitlistRes.page} / {waitlistRes.totalPages || 1}</span>
                    <Button variant="outline" size="sm" disabled={waitlistRes.page >= waitlistRes.totalPages} asChild={waitlistRes.page < waitlistRes.totalPages} className="shadow-none h-7 text-xs px-2 border-slate-200">
                       {waitlistRes.page < waitlistRes.totalPages ? <Link href={buildQuery({ wPage: String(waitlistRes.page + 1) }, sharedKeep)}>Next</Link> : <span>Next</span>}
                    </Button>
                 </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
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
