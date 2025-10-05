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

const requests = [
  {
    id: "req_001",
    title: "Street Scene Images",
    type: "Computer Vision",
    status: "active",
    submissions: 234,
    target: 500,
    reward: "$2.50",
    created: "2024-01-15",
  },
  {
    id: "req_002",
    title: "Voice Samples - English",
    type: "Speech & Audio",
    status: "active",
    submissions: 89,
    target: 200,
    reward: "$5.00",
    created: "2024-01-20",
  },
  {
    id: "req_003",
    title: "Product Reviews Dataset",
    type: "Natural Language",
    status: "paused",
    submissions: 450,
    target: 500,
    reward: "$1.50",
    created: "2024-01-10",
  },
  {
    id: "req_004",
    title: "Medical Image Labels",
    type: "Computer Vision",
    status: "active",
    submissions: 156,
    target: 300,
    reward: "$8.00",
    created: "2024-01-25",
  },
  {
    id: "req_005",
    title: "Sentiment Analysis Data",
    type: "Natural Language",
    status: "completed",
    submissions: 1000,
    target: 1000,
    reward: "$1.00",
    created: "2023-12-15",
  },
];

export function RequestsTable() {
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
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.title}</TableCell>
                <TableCell>{request.type}</TableCell>
                <TableCell>{getStatusBadge(request.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{
                          width: `${
                            (request.submissions / request.target) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {request.submissions}/{request.target}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{request.reward}</TableCell>
                <TableCell>{request.created}</TableCell>
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
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {request.status === "active" ? (
                        <DropdownMenuItem>
                          <Pause className="mr-2 h-4 w-4" />
                          Pause Request
                        </DropdownMenuItem>
                      ) : request.status === "paused" ? (
                        <DropdownMenuItem>
                          <Play className="mr-2 h-4 w-4" />
                          Resume Request
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Request
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
