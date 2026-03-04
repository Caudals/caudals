import { getDatasetExports } from "@/lib/actions/requester-actions";
import { FilesExportsBoard } from "@/components/requester/datasets/files-exports-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function FilesDownloadsPage() {
  const exportsResult = await getDatasetExports();

  if (!Array.isArray(exportsResult)) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {exportsResult.error}
      </div>
    );
  }

  const ready = exportsResult.filter((entry) => entry.status === "ready").length;
  const processing = exportsResult.filter(
    (entry) => entry.status === "pending" || entry.status === "preparing",
  ).length;
  const failed = exportsResult.filter((entry) => entry.status === "failed").length;

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        eyebrow="Files & exports"
        title="Delivery artifacts"
        description="Track export generation status, download readiness, and failed jobs across all datasets."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Ready</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{ready}</CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Processing</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{processing}</CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{failed}</CardContent>
        </Card>
      </div>

      <FilesExportsBoard records={exportsResult} />
    </div>
  );
}
