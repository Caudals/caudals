import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getWaitlistEntries,
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

type FollowupItem = {
  id: string;
  title: string;
  notes: string | null;
  created_at: string | null;
  type: "dataset" | "submission";
};

export default async function AdminSupportPage() {
  await requireAdmin();

  const [waitlistRes, followups] = await Promise.all([
    getWaitlistEntries(),
    getFollowUps(),
  ]);

  if ("error" in waitlistRes) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Unable to load waitlist</p>
            <p className="text-sm text-muted-foreground">
              {waitlistRes.error || "Please try again later."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const waitlist = waitlistRes.data ?? [];

  const changeStatus = async (formData: FormData) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Support & Waitlist</h1>
          <p className="text-sm text-muted-foreground">
            Track inbound interest and follow-ups for rejected items.
          </p>
        </div>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Waitlist</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
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
                      ? formatDistanceToNow(new Date(entry.updated_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <form action={changeStatus} className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
                      <input type="hidden" name="id" value={entry.id} />
                      <select
                        name="status"
                        defaultValue={entry.status}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="converted">Converted</option>
                      </select>
                      <Input
                        name="notes"
                        placeholder="Notes"
                        className="h-9"
                        defaultValue={(entry.metadata as { notes?: string } | null)?.notes || ""}
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
                    ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{item.title}</div>
                <Link
                  href={item.type === "dataset" ? `/browse/${item.id}` : "/admin/submissions"}
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
