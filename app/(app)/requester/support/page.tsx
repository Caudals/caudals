import Link from "next/link";
import { getSupportTickets } from "@/lib/actions/requester-actions";
import { SupportForm } from "@/components/requester/support/support-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function SupportPage() {
  const tickets = await getSupportTickets();

  if (!Array.isArray(tickets)) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {tickets.error}
      </div>
    );
  }

  const openCount = tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        eyebrow="Support"
        title="Support operations"
        description="Create tickets, track replies, and monitor resolution status for workspace issues."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Open tickets</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{openCount}</CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total tickets</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{tickets.length}</CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Latest update</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-medium">
            {tickets[0]?.updated_at ? new Date(tickets[0].updated_at).toLocaleString() : "No activity yet"}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle>New ticket</CardTitle>
            <CardDescription>Share context and expected outcome to speed resolution.</CardDescription>
          </CardHeader>
          <CardContent>
            <SupportForm />
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle>Ticket inbox</CardTitle>
            <CardDescription>Track status and open threaded conversations</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Subject</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Messages</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Last update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No tickets yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <Link href={`/requester/support/${ticket.id}`} className="font-medium hover:underline">
                          {ticket.subject}
                        </Link>
                        {ticket.last_message_preview ? (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {ticket.last_message_preview}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {ticket.status.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{ticket.message_count}</TableCell>
                      <TableCell>{new Date(ticket.updated_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
