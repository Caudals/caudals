import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function RecentRequests() {
  const requests = [
    {
      id: 1,
      title: "Street Scene Images",
      status: "active",
      submissions: 234,
      target: 500,
    },
    {
      id: 2,
      title: "Voice Samples - English",
      status: "active",
      submissions: 89,
      target: 200,
    },
    {
      id: 3,
      title: "Product Reviews Dataset",
      status: "paused",
      submissions: 450,
      target: 500,
    },
    {
      id: 4,
      title: "Medical Image Labels",
      status: "active",
      submissions: 156,
      target: 300,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "paused":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Requests</CardTitle>
        <CardDescription>
          Your active dataset collection requests
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((request) => (
          <div
            key={request.id}
            className="flex items-center justify-between space-x-4"
          >
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium leading-none">
                {request.title}
              </p>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={getStatusColor(request.status)}
                >
                  {request.status}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {request.submissions}/{request.target} submissions
                </p>
              </div>
            </div>
            <div className="flex h-full items-center">
              <div className="text-sm font-medium">
                {Math.round((request.submissions / request.target) * 100)}%
              </div>
            </div>
          </div>
        ))}
        <Button variant="outline" className="w-full" asChild>
          <Link href="/dashboard/requests">
            View All Requests
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
