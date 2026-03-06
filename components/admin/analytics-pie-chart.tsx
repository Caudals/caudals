"use client";

import * as React from "react";
import { Label, Pie, PieChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartData = [
  { status: "approved", count: 275, fill: "var(--color-approved)" },
  { status: "pending", count: 200, fill: "var(--color-pending)" },
  { status: "rejected", count: 287, fill: "var(--color-rejected)" },
  { status: "needs_funding", count: 173, fill: "var(--color-needs_funding)" },
  { status: "completed", count: 190, fill: "var(--color-completed)" },
];

const chartConfig = {
  count: {
    label: "Datasets",
  },
  approved: {
    label: "Approved",
    color: "var(--chart-1)",
  },
  pending: {
    label: "Pending",
    color: "var(--chart-2)",
  },
  rejected: {
    label: "Rejected",
    color: "var(--chart-3)",
  },
  needs_funding: {
    label: "Needs Funding",
    color: "var(--chart-4)",
  },
  completed: {
    label: "Completed",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

export function AnalyticsPieChart() {
  const totalDatasets = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.count, 0);
  }, []);

  return (
    <Card className="flex flex-col shadow-none border-border">
      <CardHeader className="items-center pb-0">
        <CardTitle>Dataset Distribution</CardTitle>
        <CardDescription>Current Catalog Breakdown</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="status"
              innerRadius={60}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {totalDatasets.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          Datasets
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm text-center">
        <div className="flex items-center gap-2 font-medium leading-none">
          Healthy active dataset ratio across platform
        </div>
        <div className="leading-none text-slate-500">
          Showing current snapshot of all dataset states
        </div>
      </CardFooter>
    </Card>
  );
}