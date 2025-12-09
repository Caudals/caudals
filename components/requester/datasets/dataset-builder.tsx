"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type DuplicateDataset = {
  id: string;
  title: string;
  reward_amount?: number | null;
  data_type?: string | null;
  samples_needed?: number | null;
  samples_collected?: number | null;
};

export function DatasetBuilder({
  templates = [],
  duplicate,
}: {
  templates: Array<{ id: string; title: string; category?: string; data_type?: string; prompt?: string }>;
  duplicate?: DuplicateDataset;
}) {
  const selectedTemplate = useMemo(
    () => (duplicate ? { id: duplicate.id, title: duplicate.title } : templates[0]),
    [duplicate, templates]
  );

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg">
          {duplicate ? "Duplicating draft" : "Dataset builder"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedTemplate ? (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border/70 p-4">
            <div>
              <p className="font-semibold">{selectedTemplate.title}</p>
              <p className="text-sm text-muted-foreground">
                {duplicate ? "We pre-filled details from this draft." : "Template selected."}
              </p>
            </div>
            <Badge variant="outline">Template</Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No templates available yet. Start with a blank brief.
          </p>
        )}
        <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
          This is a placeholder builder while requester actions are wired up.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled>Save draft</Button>
          <Button variant="outline" disabled>
            Publish dataset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
