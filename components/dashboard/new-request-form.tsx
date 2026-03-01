import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function NewRequestForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="dataset-title">
            Title
          </label>
          <Input id="dataset-title" name="title" placeholder="Dataset title" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="dataset-description">
            Description
          </label>
          <Textarea id="dataset-description" name="description" placeholder="Describe the dataset" rows={5} />
        </div>
        <Button type="button">Save draft</Button>
      </CardContent>
    </Card>
  );
}
