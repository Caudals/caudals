import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSupportTicketDetail } from "@/lib/actions/requester-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketThread } from "@/components/requester/support/ticket-thread";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function SupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getSupportTicketDetail(id);

  if ("error" in ticket) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        eyebrow="Support ticket"
        title={ticket.subject}
        description={ticket.description || "No description provided."}
        actions={
          <>
            <Badge variant="outline" className="capitalize">
              {ticket.status.replaceAll("_", " ")}
            </Badge>
            <Button variant="outline" asChild>
              <Link href="/requester/support">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to support
              </Link>
            </Button>
          </>
        }
      />

      <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0">
        <CardHeader>
          <CardTitle>Ticket details</CardTitle>
          <CardDescription>Timeline and metadata for this support request</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
          <p>Priority: <span className="font-medium text-foreground">{ticket.priority}</span></p>
          <p>Created: <span className="font-medium text-foreground">{new Date(ticket.created_at).toLocaleString()}</span></p>
          <p>Updated: <span className="font-medium text-foreground">{new Date(ticket.updated_at).toLocaleString()}</span></p>
        </CardContent>
      </Card>

      <TicketThread ticketId={ticket.id} status={ticket.status} messages={ticket.messages} />
    </div>
  );
}
