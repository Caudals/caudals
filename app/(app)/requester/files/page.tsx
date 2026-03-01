import { getDatasetExports } from "@/lib/actions/requester-actions";
import { FilesExportsBoard } from "@/components/requester/datasets/files-exports-board";

export default async function FilesDownloadsPage() {
  const exportsResult = await getDatasetExports();

  if (!Array.isArray(exportsResult)) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {exportsResult.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Files & downloads</p>
        <h1 className="text-2xl font-semibold">Exports</h1>
      </div>
      <FilesExportsBoard records={exportsResult} />
    </div>
  );
}
