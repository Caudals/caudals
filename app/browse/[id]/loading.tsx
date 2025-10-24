import { Skeleton } from "@/components/ui/skeleton";

export default function DatasetDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 space-y-6">
      <Skeleton className="h-4 w-32" />

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Main Content */}
        <div className="space-y-6">
          {/* Main Info Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="mx-auto max-w-md">
              <Skeleton className="aspect-square w-full rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="grid grid-cols-3 gap-4 rounded-lg border bg-muted/30 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>

          {/* Cards */}
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
