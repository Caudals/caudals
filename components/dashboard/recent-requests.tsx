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
import { getUserDatasetRequests } from "@/lib/actions/dataset-actions";

export async function RecentRequests() {
  const allRequests = await getUserDatasetRequests();
  const requests = allRequests.slice(0, 4);

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
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No dataset requests yet. Create your first one!
          </p>
        ) : (
          <>
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
                      {request.samples_collected}/{request.samples_needed}{" "}
                      submissions
                    </p>
                  </div>
                </div>
                <div className="flex h-full items-center">
                  <div className="text-sm font-medium">
                    {Math.round(
                      (request.samples_collected / request.samples_needed) * 100
                    )}
                    %
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
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
