import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BAR_HEIGHTS = [24, 52, 36, 68, 40, 56, 30];

export function ActivityChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-36 items-end gap-2">
          {BAR_HEIGHTS.map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-sm bg-primary/25"
              style={{ height: `${height}%` }}
              aria-hidden
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
