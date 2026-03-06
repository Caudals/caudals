import Link from "next/link";
import { getSupportTickets } from "@/lib/actions/requester-actions";
import { SupportForm } from "@/components/requester/support/support-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";
import { LifeBuoy } from "lucide-react";

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
    <div className="space-y-6 pb-10">
      <RequesterPageHeader
        title="Support Operations"
        description="Create tickets, track replies, and monitor resolution status for workspace issues."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-none border-border bg-amber-50/50 rounded-2xl">
          <CardHeader className="pb-2 border-b border-amber-100/50 mx-2 mt-2 mb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Open tickets</CardTitle>
            <LifeBuoy className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-amber-700">{openCount}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-2 border-b border-slate-200 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-foreground">{tickets.length}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-2 border-b border-slate-200 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Latest update</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-sm font-medium text-foreground mt-2">
              {tickets[0]?.updated_at ? new Date(tickets[0].updated_at).toLocaleString() : "No activity yet"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-4 border-b border-slate-200">
            <CardTitle className="text-base">New ticket</CardTitle>
            <CardDescription>Share context and expected outcome to speed resolution.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <SupportForm />
          </CardContent>
        </Card>

        <Card className="shadow-none border-border bg-background rounded-2xl overflow-hidden py-0 gap-0">
          <CardHeader className="bg-muted/5 pb-4 border-b border-slate-200">
            <CardTitle className="text-base">Ticket inbox</CardTitle>
            <CardDescription>Track status and open threaded conversations</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-medium text-slate-500 py-4 pl-6">Subject</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">Status</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">Messages</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">Last update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-slate-500">
                      <LifeBuoy className="h-10 w-10 text-slate-500/30 mx-auto mb-3" />
                      <p>No tickets yet.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((ticket) => (
                    <TableRow key={ticket.id} className="hover:bg-slate-50/50 transition-colors border-slate-200">
                      <TableCell className="pl-6 py-4">
                        <Link href={`/requester/support/${ticket.id}`} className="font-medium text-foreground hover:text-[var(--accent)] transition-colors">
                          {ticket.subject}
                        </Link>
                        {ticket.last_message_preview ? (
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                            {ticket.last_message_preview}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge 
                          variant="secondary" 
                          className={`shadow-none font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                            ticket.status === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                            ticket.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200/50' :
                            ticket.status === 'resolved' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                            'bg-muted text-slate-500 border-border'
                          }`}
                        >
                          {ticket.status.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-muted/50 text-xs font-mono text-slate-500 border border-slate-200">
                          {ticket.message_count}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(ticket.updated_at).toLocaleDateString()}
                      </TableCell>
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
