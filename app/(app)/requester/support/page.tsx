import Link from "next/link";
import { getSupportTickets } from "@/lib/actions/requester-actions";
import { SupportForm } from "@/components/requester/support/support-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function SupportPage() {
  const tickets = await getSupportTickets();

  if (!Array.isArray(tickets)) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {tickets.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Support</p>
        <h1 className="text-2xl font-semibold">Contact us</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New request</CardTitle>
          </CardHeader>
          <CardContent>
            <SupportForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Last update</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No tickets yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <Link
                          href={`/requester/support/${ticket.id}`}
                          className="font-medium hover:underline"
                        >
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
                          {ticket.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{ticket.message_count}</TableCell>
                      <TableCell>{new Date(ticket.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(ticket.created_at).toLocaleDateString()}</TableCell>
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
