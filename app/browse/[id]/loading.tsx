import { Skeleton } from "@/components/ui/skeleton";

export default function DatasetDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 space-y-8">
      <Skeleton className="h-4 w-32 rounded-full" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-8">
          <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
              <div className="space-y-4">
                <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-8 w-24 rounded-full border border-border/50"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Skeleton className="h-10 w-3/4 rounded-xl" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32 rounded-full" />
                      <Skeleton className="h-3 w-24 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full rounded-full" />
                  <Skeleton className="h-4 w-5/6 rounded-full" />
                  <Skeleton className="h-4 w-2/3 rounded-full" />
                </div>

                <div className="space-y-4 rounded-2xl border border-border/50 bg-muted/30 p-4 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-20 rounded-2xl" />
                    ))}
                  </div>
                  <Skeleton className="h-2.5 w-full rounded-full" />
                  <Skeleton className="h-3 w-40 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-60 rounded-3xl border border-border/60" />
            ))}
          </div>

          <Skeleton className="h-56 rounded-3xl border border-border/60" />
        </div>

        <div className="space-y-6">
          <Skeleton className="h-72 rounded-3xl border border-border/60" />
          <Skeleton className="h-60 rounded-3xl border border-border/60" />
        </div>
      </div>
    </div>
  );
}
