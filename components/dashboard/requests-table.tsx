"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Pause, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  updateDatasetRequest,
  deleteDatasetRequest,
} from "@/lib/actions/dataset-actions";
import { useRouter } from "next/navigation";
import { categoryLabels } from "@/lib/data/datasets";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

interface DatasetRequest {
  id: string;
  title: string;
  category: string;
  status: string;
  samples_collected: number;
  samples_needed: number;
  reward_amount: number;
  created_at: string;
}

interface RequestsTableProps {
  requests: DatasetRequest[];
}

export function RequestsTable({ requests }: RequestsTableProps) {
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();
  const handleDelete = async (id: string) => {
    if (
      !confirm(
        t("Are you sure you want to delete this request? This action cannot be undone.")
      )
    ) {
      return;
    }

    const result = await deleteDatasetRequest(id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Request deleted successfully");
      router.refresh();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-500/10 text-green-700 border-green-500/20 hover:bg-green-500/20">
            Active
          </Badge>
        );
      case "paused":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20 hover:bg-yellow-500/20">
            Paused
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20 hover:bg-blue-500/20">
            Completed
          </Badge>
        );
      case "closing-soon":
        return (
          <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20 hover:bg-orange-500/20">
            Closing Soon
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Requests</CardTitle>
        <CardDescription>
          A list of all your dataset collection requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Reward</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No dataset requests found. Create your first one!
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">{request.title}</TableCell>
                  <TableCell>
                    {categoryLabels[request.category] || request.category}
                  </TableCell>
                  <TableCell>{getStatusBadge(request.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${
                              (request.samples_collected /
                                request.samples_needed) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {request.samples_collected}/{request.samples_needed}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>${request.reward_amount}</TableCell>
                  <TableCell>
                    {new Date(request.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/requests/${request.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Manage Submissions
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="opacity-60">
                          <Pause className="mr-2 h-4 w-4" />
                          Status is controlled by approval/funding
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(request.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Request
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
