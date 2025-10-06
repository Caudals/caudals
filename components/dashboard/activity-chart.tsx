import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActivityChartData } from "@/lib/actions/dashboard-actions";

export async function ActivityChart() {
  const rawData = await getActivityChartData();

  // Format data for display (group by week or show last 30 days)
  const data =
    rawData.length > 0
      ? rawData.slice(-7).map((d) => ({
          date: new Date(d.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          submissions: d.submissions,
        }))
      : [{ date: "No data", submissions: 0 }];

  const maxValue = Math.max(...data.map((d) => d.submissions));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Daily submissions in the last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <div className="flex h-full items-end justify-between gap-2">
            {data.map((item, index) => (
              <div
                key={index}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className="w-full rounded-t-md bg-primary transition-all hover:opacity-80"
                  style={{
                    height:
                      maxValue > 0
                        ? `${(item.submissions / maxValue) * 100}%`
                        : "10%",
                    minHeight: "20px",
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {item.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
