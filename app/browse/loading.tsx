import { Skeleton } from "@/components/ui/skeleton";

export default function BrowseLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 space-y-10">
      <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="h-4 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3 rounded-xl" />

            <div className="flex flex-wrap gap-2 pt-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-8 w-28 rounded-full border border-border/50"
                />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-border/40 bg-muted/30 p-4"
              >
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="mt-3 h-6 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-12 w-full rounded-full md:max-w-xl" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-12 w-32 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm"
          >
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <div className="mt-5 space-y-3">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-5 w-3/4 rounded-full" />
              <Skeleton className="h-4 w-full rounded-full" />
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
              <Skeleton className="h-9 w-full rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
