import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Star } from "lucide-react";

export function ContributorsTable() {
  const contributors = [
    {
      id: "1",
      name: "Sarah Johnson",
      email: "sarah.j@example.com",
      avatar: "",
      submissions: 234,
      approved: 228,
      rating: 4.9,
      earned: "$585.00",
      status: "Active",
    },
    {
      id: "2",
      name: "Michael Chen",
      email: "m.chen@example.com",
      avatar: "",
      submissions: 189,
      approved: 185,
      rating: 4.8,
      earned: "$462.50",
      status: "Active",
    },
    {
      id: "3",
      name: "Emma Wilson",
      email: "emma.w@example.com",
      avatar: "",
      submissions: 156,
      approved: 150,
      rating: 4.7,
      earned: "$375.00",
      status: "Active",
    },
    {
      id: "4",
      name: "James Brown",
      email: "j.brown@example.com",
      avatar: "",
      submissions: 142,
      approved: 138,
      rating: 4.9,
      earned: "$345.00",
      status: "Active",
    },
    {
      id: "5",
      name: "Olivia Davis",
      email: "olivia.d@example.com",
      avatar: "",
      submissions: 98,
      approved: 92,
      rating: 4.6,
      earned: "$230.00",
      status: "Active",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Contributors</CardTitle>
        <CardDescription>
          Your most active contributors and their performance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {contributors.map((contributor) => (
            <div
              key={contributor.id}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={contributor.avatar}
                    alt={contributor.name}
                  />
                  <AvatarFallback>
                    {contributor.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium leading-none">
                    {contributor.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {contributor.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {contributor.approved}/{contributor.submissions}
                  </p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                  <span className="text-sm font-medium">
                    {contributor.rating}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{contributor.earned}</p>
                  <p className="text-xs text-muted-foreground">Earned</p>
                </div>
                <Badge variant="outline" className="text-emerald-600">
                  {contributor.status}
                </Badge>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
