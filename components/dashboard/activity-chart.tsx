"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ActivityChart() {
  const data = [
    { month: "Jan", submissions: 186 },
    { month: "Feb", submissions: 305 },
    { month: "Mar", submissions: 237 },
    { month: "Apr", submissions: 273 },
    { month: "May", submissions: 409 },
    { month: "Jun", submissions: 514 },
  ];

  const maxValue = Math.max(...data.map((d) => d.submissions));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submissions Over Time</CardTitle>
        <CardDescription>
          Total approved submissions in the last 6 months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <div className="flex h-full items-end justify-between gap-2">
            {data.map((item) => (
              <div
                key={item.month}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className="w-full rounded-t-md bg-primary transition-all hover:opacity-80"
                  style={{
                    height: `${(item.submissions / maxValue) * 100}%`,
                    minHeight: "20px",
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {item.month}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
