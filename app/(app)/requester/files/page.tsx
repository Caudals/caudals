import { getDatasetExports } from "@/lib/actions/requester-actions";
import { FilesExportsBoard } from "@/components/requester/datasets/files-exports-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

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
    <div className="space-y-6 pb-10">
      <RequesterPageHeader
        title="Delivery Artifacts"
        description="Track export generation status, download readiness, and failed jobs across all datasets."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-none border-border bg-emerald-50/50 rounded-2xl">
          <CardHeader className="pb-2 border-b border-emerald-100/50 mx-2 mt-2 mb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Ready</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-emerald-700">{ready}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-blue-50/50 rounded-2xl">
          <CardHeader className="pb-2 border-b border-blue-100/50 mx-2 mt-2 mb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Processing</CardTitle>
            <Loader2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-blue-700">{processing}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-red-50/50 rounded-2xl">
          <CardHeader className="pb-2 border-b border-red-100/50 mx-2 mt-2 mb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-bold text-red-800 uppercase tracking-wider">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-destructive">{failed}</div>
          </CardContent>
        </Card>
      </div>

      <FilesExportsBoard records={exportsResult} />
    </div>
  );
}
