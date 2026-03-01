import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DEFAULT_STATS = [
  { label: "Active requests", value: "0" },
  { label: "Submissions", value: "0" },
  { label: "Approved", value: "0" },
  { label: "Avg. quality", value: "N/A" },
];

export function StatsCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {DEFAULT_STATS.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
