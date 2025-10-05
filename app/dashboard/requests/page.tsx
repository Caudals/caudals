import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const requests = [
  {
    id: 1,
    title: "Medical Image Classification",
    category: "Computer Vision",
    submissions: 234,
    approved: 189,
    rejected: 28,
    pending: 17,
    status: "active",
    budget: "$5,000",
    created: "2024-01-15",
    deadline: "2024-02-15",
  },
  {
    id: 2,
    title: "Voice Recognition Dataset",
    category: "Speech & Audio",
    submissions: 456,
    approved: 401,
    rejected: 45,
    pending: 10,
    status: "active",
    budget: "$8,500",
    created: "2024-01-20",
    deadline: "2024-02-20",
  },
  {
    id: 3,
    title: "Product Image Segmentation",
    category: "Computer Vision",
    submissions: 128,
    approved: 98,
    rejected: 12,
    pending: 18,
    status: "review",
    budget: "$3,200",
    created: "2024-01-10",
    deadline: "2024-02-10",
  },
  {
    id: 4,
    title: "Sentiment Analysis Text Data",
    category: "Natural Language",
    submissions: 312,
    approved: 289,
    rejected: 23,
    pending: 0,
    status: "completed",
    budget: "$4,000",
    created: "2023-12-15",
    deadline: "2024-01-15",
  },
  {
    id: 5,
    title: "Multi-Language Translation",
    category: "Natural Language",
    submissions: 89,
    approved: 67,
    rejected: 8,
    pending: 14,
    status: "paused",
    budget: "$6,000",
    created: "2024-01-25",
    deadline: "2024-03-01",
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20 hover:bg-green-100">
          Active
        </Badge>
      );
    case "review":
      return (
        <Badge className="bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20 hover:bg-yellow-100">
          In Review
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 hover:bg-blue-100">
          Completed
        </Badge>
      );
    case "paused":
      return (
        <Badge className="bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-600/20 hover:bg-gray-100">
          Paused
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function RequestsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>My Requests</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild>
            <Link href="/dashboard/requests/new">
              <Plus className="mr-2 h-4 w-4" />
              New Request
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-6 p-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Requests</h1>
            <p className="text-muted-foreground">
              Manage all your dataset collection requests
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search requests..."
                className="pl-9"
              />
            </div>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
          </div>

          {/* Requests Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id} className="group">
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/requests/${request.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {request.title}
                      </Link>
                    </TableCell>
                    <TableCell>{request.category}</TableCell>
                    <TableCell>{request.submissions}</TableCell>
                    <TableCell>
                      <span className="text-green-600">{request.approved}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-yellow-600">{request.pending}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell className="font-medium">
                      {request.budget}
                    </TableCell>
                    <TableCell>{request.deadline}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/requests/${request.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/dashboard/requests/${request.id}/edit`}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
