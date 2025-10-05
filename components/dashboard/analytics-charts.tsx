"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AnalyticsCharts() {
  const qualityData = [
    { category: "Computer Vision", score: 96 },
    { category: "Natural Language", score: 93 },
    { category: "Speech & Audio", score: 95 },
    { category: "Other", score: 91 },
  ];

  const timeData = [
    { month: "Jan", days: 5.2 },
    { month: "Feb", days: 4.8 },
    { month: "Mar", days: 4.5 },
    { month: "Apr", days: 4.2 },
    { month: "May", days: 4.0 },
    { month: "Jun", days: 4.2 },
  ];

  const maxDays = Math.max(...timeData.map((d) => d.days));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Quality by Category</CardTitle>
          <CardDescription>
            Average quality scores across different data types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {qualityData.map((item) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.category}</span>
                  <span className="text-muted-foreground">{item.score}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avg. Completion Time</CardTitle>
          <CardDescription>
            Average time to complete requests over the last 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex h-[200px] items-end justify-between gap-2">
              {timeData.map((item) => (
                <div
                  key={item.month}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div
                    className="w-full rounded-t-md bg-primary transition-all hover:opacity-80"
                    style={{
                      height: `${(item.days / maxDays) * 100}%`,
                      minHeight: "20px",
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.month}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Days to complete
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
