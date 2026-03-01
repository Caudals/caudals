import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Contributor = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  status?: string | null;
};

type ContributorsTableProps = {
  contributors?: Contributor[] | null;
};

export function ContributorsTable({ contributors = [] }: ContributorsTableProps) {
  const rows = contributors ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contributors</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contributors yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((contributor, index) => (
              <div key={contributor.id ?? `contributor-${index}`} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{contributor.full_name ?? "Unnamed contributor"}</p>
                <p className="text-muted-foreground">{contributor.email ?? "No email"}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
