import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSupportTicketDetail } from "@/lib/actions/requester-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketThread } from "@/components/requester/support/ticket-thread";

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
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" asChild>
          <Link href="/requester/support">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to support
          </Link>
        </Button>
        <Badge variant="outline" className="capitalize">
          {ticket.status}
        </Badge>
      </div>

      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle>{ticket.subject}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {ticket.description || "No description provided."}
          </p>
          <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
            <p>Priority: {ticket.priority}</p>
            <p>Created: {new Date(ticket.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(ticket.updated_at).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <TicketThread
        ticketId={ticket.id}
        status={ticket.status}
        messages={ticket.messages}
      />
    </div>
  );
}
